from datetime import UTC, datetime

from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.workshop import get_workshop_status, submit_incident_batch


class FakeIncidentBatchStateStore:
    def __init__(self, *, already_injected: bool = False) -> None:
        self._already_injected = already_injected
        self.claim_calls: list[tuple[str, int, datetime]] = []

    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> bool:
        self.claim_calls.append((batch_id, event_count, claimed_at))
        if self._already_injected:
            return False
        self._already_injected = True
        return True

    def is_batch_injected(self, batch_id: str) -> bool:
        return self._already_injected


def test_get_workshop_status_reports_the_incident_batch_id_and_injection_state() -> None:
    status = get_workshop_status(FakeIncidentBatchStateStore(already_injected=True))

    assert status.incident_batch_id == INCIDENT_BATCH_ID
    assert status.incident_batch_injected is True


def test_get_workshop_status_reports_not_yet_injected() -> None:
    status = get_workshop_status(FakeIncidentBatchStateStore(already_injected=False))

    assert status.incident_batch_injected is False


def test_submit_incident_batch_claims_and_returns_the_twenty_v2_events_once() -> None:
    state_store = FakeIncidentBatchStateStore()
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_incident_batch(state_store, claimed_at=claimed_at)

    assert submission.already_injected is False
    assert submission.events == build_incident_events_v2()
    assert state_store.claim_calls == [(INCIDENT_BATCH_ID, 20, claimed_at)]


def test_submit_incident_batch_is_idempotent_when_already_claimed() -> None:
    state_store = FakeIncidentBatchStateStore(already_injected=True)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_incident_batch(state_store, claimed_at=claimed_at)

    assert submission.already_injected is True
    assert submission.events == ()
