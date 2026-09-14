from collections.abc import Sequence
from datetime import UTC, datetime

import pytest

from order_events.batches import (
    CONTROL_BATCH_ID,
    INCIDENT_BATCH_ID,
    build_control_events_v1,
    build_incident_events_v2,
)
from order_events.contracts import ReceiptEvent
from order_events.workshop import (
    BatchClaim,
    ClaimOutcome,
    ReceiptCounts,
    get_workshop_status,
    submit_control_batch,
    submit_incident_batch,
)


class FakeIncidentBatchStateStore:
    def __init__(self, *, already_injected: bool = False, contested: bool = False) -> None:
        self._status: str | None = "completed" if already_injected else None
        self._contested = contested
        self._claim_token_counter = 0
        self._claim_token: str | None = None
        self.claim_calls: list[tuple[str, int, datetime]] = []
        self.completed_calls: list[tuple[str, datetime]] = []
        self.released_batches: list[tuple[str, str]] = []
        # Set to simulate a mark_batch_completed write that fails after the send has
        # already gone out: the claim stays "pending" for a later retry to recover.
        self.completion_error: Exception | None = None

    def _next_claim(self, outcome: ClaimOutcome) -> BatchClaim:
        self._claim_token_counter += 1
        self._claim_token = f"claim-token-{self._claim_token_counter}"
        return BatchClaim(outcome=outcome, claim_token=self._claim_token)

    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> BatchClaim:
        self.claim_calls.append((batch_id, event_count, claimed_at))
        if self._contested:
            # Another caller concurrently won the recovery race for this claim.
            return BatchClaim(outcome=ClaimOutcome.CONTESTED)
        if self._status == "completed":
            return BatchClaim(outcome=ClaimOutcome.ALREADY_COMPLETED)
        if self._status == "pending":
            return self._next_claim(ClaimOutcome.RECOVERABLE)
        self._status = "pending"
        return self._next_claim(ClaimOutcome.CLAIMED)

    def mark_batch_completed(self, batch_id: str, *, completed_at: datetime) -> None:
        self.completed_calls.append((batch_id, completed_at))
        if self.completion_error is not None:
            # The write fails but the claim is intentionally left "pending" so a retry
            # can recover it, instead of being released back to an unclaimed state.
            raise self.completion_error
        self._status = "completed"

    def release_batch_claim(self, batch_id: str, *, claim_token: str) -> None:
        self.released_batches.append((batch_id, claim_token))
        if self._claim_token == claim_token:
            self._status = None

    def is_batch_injected(self, batch_id: str) -> bool:
        return self._status == "completed"


class FakeIncidentEventSender:
    def __init__(self, *, error: Exception | None = None) -> None:
        self._error = error
        self.send_calls: list[tuple[ReceiptEvent, ...]] = []

    def send_events(self, events: Sequence[ReceiptEvent]) -> None:
        self.send_calls.append(tuple(events))
        if self._error is not None:
            raise self._error


class FakeReceiptCountStore:
    def __init__(self, counts: ReceiptCounts) -> None:
        self._counts = counts

    def count_receipts(self) -> ReceiptCounts:
        return self._counts


def test_get_workshop_status_reports_the_incident_batch_id_and_injection_state() -> None:
    status = get_workshop_status(
        FakeIncidentBatchStateStore(already_injected=True),
        FakeReceiptCountStore(ReceiptCounts(total=0, v1=0, v2=0)),
        deployed_commit_sha=None,
        deployed_at_utc=None,
    )

    assert status.incident_batch_id == INCIDENT_BATCH_ID
    assert status.incident_batch_injected is True


def test_get_workshop_status_reports_not_yet_injected() -> None:
    status = get_workshop_status(
        FakeIncidentBatchStateStore(already_injected=False),
        FakeReceiptCountStore(ReceiptCounts(total=0, v1=0, v2=0)),
        deployed_commit_sha=None,
        deployed_at_utc=None,
    )

    assert status.incident_batch_injected is False


def test_get_workshop_status_reports_deployment_provenance_and_receipt_counts() -> None:
    status = get_workshop_status(
        FakeIncidentBatchStateStore(already_injected=True),
        FakeReceiptCountStore(ReceiptCounts(total=23, v1=3, v2=20)),
        deployed_commit_sha="a26ce2cd82b704ebd201f5990f12ce47b53b3948",
        deployed_at_utc="2026-08-17T13:52:55Z",
    )

    assert status.deployed_commit_sha == "a26ce2cd82b704ebd201f5990f12ce47b53b3948"
    assert status.deployed_at_utc == "2026-08-17T13:52:55Z"
    assert status.normalized_receipt_count == 23
    assert status.v1_receipt_count == 3
    assert status.v2_receipt_count == 20


def test_get_workshop_status_allows_unset_deployment_provenance_before_the_first_deploy() -> None:
    status = get_workshop_status(
        FakeIncidentBatchStateStore(),
        FakeReceiptCountStore(ReceiptCounts(total=0, v1=0, v2=0)),
        deployed_commit_sha=None,
        deployed_at_utc=None,
    )

    assert status.deployed_commit_sha is None
    assert status.deployed_at_utc is None


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

    assert state_store.released_batches == [(INCIDENT_BATCH_ID, "claim-token-1")]
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


def test_submit_incident_batch_recovers_a_pending_claim_after_a_failed_completion_write() -> None:
    # Regression test: a send that succeeds followed by a mark_batch_completed write
    # that fails must leave the batch pending (not injected) rather than permanently
    # stuck, and a later retry must re-drive the same deterministic batch to
    # completion. A subsequent repeat submission after that must send nothing.
    state_store = FakeIncidentBatchStateStore()
    state_store.completion_error = RuntimeError("simulated Table Storage write failure")
    sender = FakeIncidentEventSender()
    first_claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    with pytest.raises(RuntimeError, match="simulated Table Storage write failure"):
        submit_incident_batch(state_store, sender, claimed_at=first_claimed_at)

    # The send already went out, but completion never landed: not yet injected.
    assert sender.send_calls == [build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is False
    assert state_store.released_batches == []

    state_store.completion_error = None
    retry_claimed_at = datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC)
    retry_submission = submit_incident_batch(state_store, sender, claimed_at=retry_claimed_at)

    assert retry_submission.already_injected is False
    assert retry_submission.events == build_incident_events_v2()
    assert sender.send_calls == [build_incident_events_v2(), build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True

    later_submission = submit_incident_batch(
        state_store, sender, claimed_at=datetime(2026, 8, 17, 13, 54, 0, tzinfo=UTC)
    )

    assert later_submission.already_injected is True
    assert later_submission.events == ()
    assert sender.send_calls == [build_incident_events_v2(), build_incident_events_v2()]


def test_submit_control_batch_claims_sends_and_completes_the_three_v1_events_once() -> None:
    state_store = FakeIncidentBatchStateStore()
    sender = FakeIncidentEventSender()
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_control_batch(state_store, sender, claimed_at=claimed_at)

    assert submission.already_injected is False
    assert submission.events == build_control_events_v1()
    assert state_store.claim_calls == [(CONTROL_BATCH_ID, 3, claimed_at)]
    assert sender.send_calls == [build_control_events_v1()]
    assert state_store.completed_calls == [(CONTROL_BATCH_ID, claimed_at)]
    assert state_store.is_batch_injected(CONTROL_BATCH_ID) is True


def test_submit_control_batch_is_idempotent_when_already_claimed() -> None:
    state_store = FakeIncidentBatchStateStore(already_injected=True)
    sender = FakeIncidentEventSender()
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    submission = submit_control_batch(state_store, sender, claimed_at=claimed_at)

    assert submission.already_injected is True
    assert submission.events == ()
    assert sender.send_calls == []


def test_submit_control_batch_releases_the_claim_and_reraises_when_send_fails() -> None:
    state_store = FakeIncidentBatchStateStore()
    sender = FakeIncidentEventSender(error=RuntimeError("simulated Service Bus send failure"))
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)

    with pytest.raises(RuntimeError, match="simulated Service Bus send failure"):
        submit_control_batch(state_store, sender, claimed_at=claimed_at)

    assert state_store.released_batches == [(CONTROL_BATCH_ID, "claim-token-1")]
    assert state_store.is_batch_injected(CONTROL_BATCH_ID) is False
