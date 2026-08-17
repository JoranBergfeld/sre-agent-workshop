from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.contracts import ReceiptEventV2


class IncidentBatchStateStore(Protocol):
    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> bool: ...

    def is_batch_injected(self, batch_id: str) -> bool: ...


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
    state_store: IncidentBatchStateStore, *, claimed_at: datetime
) -> IncidentBatchSubmission:
    events = build_incident_events_v2()
    claimed = state_store.claim_batch(
        batch_id=INCIDENT_BATCH_ID, event_count=len(events), claimed_at=claimed_at
    )

    if not claimed:
        return IncidentBatchSubmission(already_injected=True, events=())

    return IncidentBatchSubmission(already_injected=False, events=events)
