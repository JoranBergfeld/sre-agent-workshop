from collections.abc import Sequence
from datetime import UTC, datetime

import pytest

from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.contracts import ReceiptEventV2
from order_events.workshop import get_workshop_status, submit_incident_batch


class FakeIncidentBatchStateStore:
    def __init__(self, *, already_injected: bool = False) -> None:
        self._status: str | None = "completed" if already_injected else None
        self.claim_calls: list[tuple[str, int, datetime]] = []
        self.completed_calls: list[tuple[str, datetime]] = []
        self.released_batches: list[str] = []

    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> bool:
        self.claim_calls.append((batch_id, event_count, claimed_at))
        if self._status is not None:
            return False
        self._status = "pending"
        return True

    def mark_batch_completed(self, batch_id: str, *, completed_at: datetime) -> None:
        self.completed_calls.append((batch_id, completed_at))
        self._status = "completed"

    def release_batch_claim(self, batch_id: str) -> None:
        self.released_batches.append(batch_id)
        self._status = None

    def is_batch_injected(self, batch_id: str) -> bool:
        return self._status == "completed"


class FakeIncidentEventSender:
    def __init__(self, *, error: Exception | None = None) -> None:
        self._error = error
        self.send_calls: list[tuple[ReceiptEventV2, ...]] = []

    def send_events(self, events: Sequence[ReceiptEventV2]) -> None:
        self.send_calls.append(tuple(events))
        if self._error is not None:
            raise self._error


def test_get_workshop_status_reports_the_incident_batch_id_and_injection_state() -> None:
    status = get_workshop_status(FakeIncidentBatchStateStore(already_injected=True))

    assert status.incident_batch_id == INCIDENT_BATCH_ID
    assert status.incident_batch_injected is True


def test_get_workshop_status_reports_not_yet_injected() -> None:
    status = get_workshop_status(FakeIncidentBatchStateStore(already_injected=False))

    assert status.incident_batch_injected is False


def test_submit_incident_batch_claims_sends_and_completes_the_twenty_v2_events_once() -> None:
    state_store = FakeIncidentBatchStateStore()
    sender = FakeIncidentEventSender()
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_incident_batch(state_store, sender, claimed_at=claimed_at)

    assert submission.already_injected is False
    assert submission.events == build_incident_events_v2()
    assert state_store.claim_calls == [(INCIDENT_BATCH_ID, 20, claimed_at)]
    assert sender.send_calls == [build_incident_events_v2()]
    assert state_store.completed_calls == [(INCIDENT_BATCH_ID, claimed_at)]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True


def test_submit_incident_batch_is_idempotent_when_already_claimed() -> None:
    state_store = FakeIncidentBatchStateStore(already_injected=True)
    sender = FakeIncidentEventSender()
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_incident_batch(state_store, sender, claimed_at=claimed_at)

    assert submission.already_injected is True
    assert submission.events == ()
    assert sender.send_calls == []


def test_submit_incident_batch_releases_the_claim_and_reraises_when_send_fails() -> None:
    state_store = FakeIncidentBatchStateStore()
    sender = FakeIncidentEventSender(error=RuntimeError("simulated Service Bus send failure"))
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    with pytest.raises(RuntimeError, match="simulated Service Bus send failure"):
        submit_incident_batch(state_store, sender, claimed_at=claimed_at)

    assert state_store.released_batches == [INCIDENT_BATCH_ID]
    assert state_store.completed_calls == []
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is False


def test_submit_incident_batch_can_be_retried_after_a_failed_send() -> None:
    state_store = FakeIncidentBatchStateStore()
    failing_sender = FakeIncidentEventSender(
        error=RuntimeError("simulated Service Bus send failure")
    )
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    with pytest.raises(RuntimeError):
        submit_incident_batch(state_store, failing_sender, claimed_at=claimed_at)

    working_sender = FakeIncidentEventSender()
    retry_claimed_at = datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC)

    submission = submit_incident_batch(state_store, working_sender, claimed_at=retry_claimed_at)

    assert submission.already_injected is False
    assert submission.events == build_incident_events_v2()
    assert working_sender.send_calls == [build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True
