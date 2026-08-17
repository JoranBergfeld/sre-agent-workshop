from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Protocol

from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.contracts import ReceiptEventV2


class ClaimOutcome(Enum):
    """Result of attempting to claim the incident batch for submission.

    ``CLAIMED`` and ``RECOVERABLE`` both mean this caller now owns the batch's pending
    claim and must (re)send it. ``RECOVERABLE`` specifically means a *previous*
    attempt's claim was found still pending: its Service Bus send may already have
    succeeded, but the completion write that should have followed never landed. The
    incident batch is deterministic and downstream receipt handling is idempotent, so
    resending it and completing it now is a safe, intentional at-least-once recovery.
    ``CONTESTED`` means another caller still owns the fresh pending claim or won the
    stale-claim recovery race, so this caller must not send anything.
    """

    CLAIMED = "claimed"
    RECOVERABLE = "recoverable"
    ALREADY_COMPLETED = "already_completed"
    CONTESTED = "contested"


@dataclass(frozen=True, slots=True)
class BatchClaim:
    outcome: ClaimOutcome
    claim_token: str | None = None


class IncidentBatchStateStore(Protocol):
    def claim_batch(
        self, *, batch_id: str, event_count: int, claimed_at: datetime
    ) -> BatchClaim: ...

    def mark_batch_completed(self, batch_id: str, *, completed_at: datetime) -> None: ...

    def release_batch_claim(self, batch_id: str, *, claim_token: str) -> None: ...

    def is_batch_injected(self, batch_id: str) -> bool: ...


class IncidentEventSender(Protocol):
    def send_events(self, events: Sequence[ReceiptEventV2]) -> None: ...


@dataclass(frozen=True, slots=True)
class WorkshopStatus:
    incident_batch_id: str
    incident_batch_injected: bool


@dataclass(frozen=True, slots=True)
class IncidentBatchSubmission:
    already_injected: bool
    events: tuple[ReceiptEventV2, ...]


def get_workshop_status(state_store: IncidentBatchStateStore) -> WorkshopStatus:
    return WorkshopStatus(
        incident_batch_id=INCIDENT_BATCH_ID,
        incident_batch_injected=state_store.is_batch_injected(INCIDENT_BATCH_ID),
    )


def submit_incident_batch(
    state_store: IncidentBatchStateStore,
    sender: IncidentEventSender,
    *,
    claimed_at: datetime,
) -> IncidentBatchSubmission:
    events = build_incident_events_v2()
    claim = state_store.claim_batch(
        batch_id=INCIDENT_BATCH_ID, event_count=len(events), claimed_at=claimed_at
    )

    if claim.outcome is ClaimOutcome.ALREADY_COMPLETED:
        return IncidentBatchSubmission(already_injected=True, events=())

    if claim.outcome is ClaimOutcome.CONTESTED:
        # Another caller still owns (or already recovered) this same pending claim; do
        # not race it with a duplicate send. The batch is not yet completed, so it
        # must not be reported as injected.
        return IncidentBatchSubmission(already_injected=False, events=())

    claim_token = claim.claim_token
    if claim_token is None:
        raise RuntimeError(f"claim outcome {claim.outcome.value} must include a claim token")

    # outcome is CLAIMED or RECOVERABLE: this caller now owns the claim and must send
    # (or resend) the deterministic batch and complete it.
    try:
        sender.send_events(events)
    except Exception:
        # A failed send must not leave the batch permanently claimed: release it so a
        # future submit-v2-orders retry can reclaim and resend the same incident batch.
        state_store.release_batch_claim(INCIDENT_BATCH_ID, claim_token=claim_token)
        raise

    state_store.mark_batch_completed(INCIDENT_BATCH_ID, completed_at=claimed_at)
    return IncidentBatchSubmission(already_injected=False, events=events)
