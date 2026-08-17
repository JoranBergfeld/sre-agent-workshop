from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.contracts import ReceiptEventV2


class IncidentBatchStateStore(Protocol):
    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> bool: ...

    def mark_batch_completed(self, batch_id: str, *, completed_at: datetime) -> None: ...

    def release_batch_claim(self, batch_id: str) -> None: ...

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
    claimed = state_store.claim_batch(
        batch_id=INCIDENT_BATCH_ID, event_count=len(events), claimed_at=claimed_at
    )

    if not claimed:
        return IncidentBatchSubmission(already_injected=True, events=())

    try:
        sender.send_events(events)
    except Exception:
        # A failed send must not leave the batch permanently claimed: release it so a
        # future submit-v2-orders retry can reclaim and resend the same incident batch.
        state_store.release_batch_claim(INCIDENT_BATCH_ID)
        raise

    state_store.mark_batch_completed(INCIDENT_BATCH_ID, completed_at=claimed_at)
    return IncidentBatchSubmission(already_injected=False, events=events)
