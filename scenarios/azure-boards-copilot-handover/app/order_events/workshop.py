from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Protocol

from order_events.batches import (
    CONTROL_BATCH_ID,
    INCIDENT_BATCH_ID,
    build_control_events_v1,
    build_incident_events_v2,
)
from order_events.contracts import ReceiptEvent


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
    def send_events(self, events: Sequence[ReceiptEvent]) -> None: ...


@dataclass(frozen=True, slots=True)
class ReceiptCounts:
    """Aggregate normalized-receipt counts backing the keyed status surface."""

    total: int
    v1: int
    v2: int


class ReceiptCountStore(Protocol):
    def count_receipts(self) -> ReceiptCounts: ...


@dataclass(frozen=True, slots=True)
class WorkshopStatus:
    incident_batch_id: str
    incident_batch_injected: bool
    deployed_commit_sha: str | None
    deployed_at_utc: str | None
    normalized_receipt_count: int
    v1_receipt_count: int
    v2_receipt_count: int


@dataclass(frozen=True, slots=True)
class BatchSubmission:
    already_injected: bool
    events: tuple[ReceiptEvent, ...]


def get_workshop_status(
    state_store: IncidentBatchStateStore,
    receipt_count_store: ReceiptCountStore,
    *,
    deployed_commit_sha: str | None,
    deployed_at_utc: str | None,
) -> WorkshopStatus:
    counts = receipt_count_store.count_receipts()
    return WorkshopStatus(
        incident_batch_id=INCIDENT_BATCH_ID,
        incident_batch_injected=state_store.is_batch_injected(INCIDENT_BATCH_ID),
        deployed_commit_sha=deployed_commit_sha,
        deployed_at_utc=deployed_at_utc,
        normalized_receipt_count=counts.total,
        v1_receipt_count=counts.v1,
        v2_receipt_count=counts.v2,
    )


def _submit_batch(
    state_store: IncidentBatchStateStore,
    sender: IncidentEventSender,
    *,
    batch_id: str,
    events: tuple[ReceiptEvent, ...],
    claimed_at: datetime,
) -> BatchSubmission:
    claim = state_store.claim_batch(
        batch_id=batch_id, event_count=len(events), claimed_at=claimed_at
    )

    if claim.outcome is ClaimOutcome.ALREADY_COMPLETED:
        return BatchSubmission(already_injected=True, events=())

    if claim.outcome is ClaimOutcome.CONTESTED:
        # Another caller still owns (or already recovered) this same pending claim; do
        # not race it with a duplicate send. The batch is not yet completed, so it
        # must not be reported as injected.
        return BatchSubmission(already_injected=False, events=())

    claim_token = claim.claim_token
    if claim_token is None:
        raise RuntimeError(f"claim outcome {claim.outcome.value} must include a claim token")

    # outcome is CLAIMED or RECOVERABLE: this caller now owns the claim and must send
    # (or resend) the deterministic batch and complete it.
    try:
        sender.send_events(events)
    except Exception:
        # A failed send must not leave the batch permanently claimed: release it so a
        # future retry can reclaim and resend the same deterministic batch.
        state_store.release_batch_claim(batch_id, claim_token=claim_token)
        raise

    state_store.mark_batch_completed(batch_id, completed_at=claimed_at)
    return BatchSubmission(already_injected=False, events=events)


def submit_incident_batch(
    state_store: IncidentBatchStateStore,
    sender: IncidentEventSender,
    *,
    claimed_at: datetime,
) -> BatchSubmission:
    return _submit_batch(
        state_store,
        sender,
        batch_id=INCIDENT_BATCH_ID,
        events=build_incident_events_v2(),
        claimed_at=claimed_at,
    )


def submit_control_batch(
    state_store: IncidentBatchStateStore,
    sender: IncidentEventSender,
    *,
    claimed_at: datetime,
) -> BatchSubmission:
    return _submit_batch(
        state_store,
        sender,
        batch_id=CONTROL_BATCH_ID,
        events=build_control_events_v1(),
        claimed_at=claimed_at,
    )
