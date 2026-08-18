import json
from collections.abc import Sequence
from datetime import UTC, datetime

import azure.functions as func
import pytest

import function_app
from order_events.batches import (
    CONTROL_BATCH_ID,
    INCIDENT_BATCH_ID,
    build_control_events_v1,
    build_incident_events_v2,
)
from order_events.contracts import ReceiptEvent
from order_events.normalizer import NormalizedReceipt
from order_events.workshop import BatchClaim, ClaimOutcome, ReceiptCounts


class FakeReceiptStore:
    def __init__(self) -> None:
        self.calls: list[tuple[NormalizedReceipt, datetime]] = []

    def upsert_receipt(self, receipt: NormalizedReceipt, *, processed_at: datetime) -> None:
        self.calls.append((receipt, processed_at))

    def count_receipts(self) -> ReceiptCounts:
        v1_count = sum(1 for receipt, _ in self.calls if receipt.sourceSchemaVersion == "v1")
        v2_count = sum(1 for receipt, _ in self.calls if receipt.sourceSchemaVersion == "v2")
        return ReceiptCounts(total=v1_count + v2_count, v1=v1_count, v2=v2_count)


class FakeScenarioStateStore:
    def __init__(self, *, already_injected: bool = False) -> None:
        self._status: str | None = "completed" if already_injected else None
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


class FakeServiceBusMessage:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def get_body(self) -> bytes:
        return self._body


def _http_request(*, method: str, route: str) -> func.HttpRequest:
    return func.HttpRequest(method=method, url=f"http://localhost/api/{route}", body=b"")


def test_process_order_event_persists_a_supported_receipt(monkeypatch: pytest.MonkeyPatch) -> None:
    receipt_store = FakeReceiptStore()
    monkeypatch.setattr(function_app, "_receipt_store", lambda: receipt_store)

    function_app.process_order_event(
        FakeServiceBusMessage(
            b'{"schemaVersion":"v1","orderId":"order-1001","customerId":"customer-2001",'
            b'"total":"12.34","currency":"USD"}'
        )
    )

    assert [receipt.orderId for receipt, _ in receipt_store.calls] == ["order-1001"]


def test_workshop_status_reports_injection_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        function_app,
        "_scenario_state_store",
        lambda: FakeScenarioStateStore(already_injected=True),
    )
    monkeypatch.setattr(function_app, "_receipt_store", lambda: FakeReceiptStore())
    monkeypatch.delenv("DEPLOYED_COMMIT_SHA", raising=False)
    monkeypatch.delenv("DEPLOYED_AT_UTC", raising=False)

    response = function_app.workshop_status(_http_request(method="GET", route="status"))

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "incidentBatchId": INCIDENT_BATCH_ID,
        "incidentBatchInjected": True,
        "deployedCommitSha": None,
        "deployedAtUtc": None,
        "normalizedReceiptCount": 0,
        "v1ReceiptCount": 0,
        "v2ReceiptCount": 0,
    }


def test_workshop_status_reports_deployment_provenance_and_receipt_counts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    receipt_store = FakeReceiptStore()
    processed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    for index in range(1, 4):
        receipt_store.upsert_receipt(
            NormalizedReceipt(
                sourceSchemaVersion="v1",
                customerId=f"control-customer-{index:03d}",
                amountMinor=100,
                currency="USD",
                orderId=f"control-order-{index:03d}",
            ),
            processed_at=processed_at,
        )
    for index in range(1, 21):
        receipt_store.upsert_receipt(
            NormalizedReceipt(
                sourceSchemaVersion="v2",
                customerId=f"incident-customer-{index:03d}",
                amountMinor=10050,
                currency="USD",
                orderId=f"incident-order-{index:03d}",
            ),
            processed_at=processed_at,
        )
    monkeypatch.setattr(
        function_app,
        "_scenario_state_store",
        lambda: FakeScenarioStateStore(already_injected=True),
    )
    monkeypatch.setattr(function_app, "_receipt_store", lambda: receipt_store)
    monkeypatch.setenv("DEPLOYED_COMMIT_SHA", "a26ce2cd82b704ebd201f5990f12ce47b53b3948")
    monkeypatch.setenv("DEPLOYED_AT_UTC", "2026-08-17T13:52:55Z")

    response = function_app.workshop_status(_http_request(method="GET", route="status"))

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "incidentBatchId": INCIDENT_BATCH_ID,
        "incidentBatchInjected": True,
        "deployedCommitSha": "a26ce2cd82b704ebd201f5990f12ce47b53b3948",
        "deployedAtUtc": "2026-08-17T13:52:55Z",
        "normalizedReceiptCount": 23,
        "v1ReceiptCount": 3,
        "v2ReceiptCount": 20,
    }


def test_submit_v2_orders_enqueues_the_incident_batch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_store = FakeScenarioStateStore()
    sender = FakeIncidentEventSender()
    monkeypatch.setattr(function_app, "_scenario_state_store", lambda: state_store)
    monkeypatch.setattr(function_app, "_event_sender", lambda: sender)
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    )

    response = function_app.submit_v2_orders(_http_request(method="POST", route="submit-v2-orders"))

    assert response.status_code == 202
    assert json.loads(response.get_body()) == {
        "incidentBatchAlreadyInjected": False,
        "eventsEnqueued": 20,
    }
    assert sender.send_calls == [build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True


def test_submit_v2_orders_is_idempotent_when_already_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = FakeIncidentEventSender()
    monkeypatch.setattr(
        function_app,
        "_scenario_state_store",
        lambda: FakeScenarioStateStore(already_injected=True),
    )
    monkeypatch.setattr(function_app, "_event_sender", lambda: sender)

    response = function_app.submit_v2_orders(_http_request(method="POST", route="submit-v2-orders"))

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "incidentBatchAlreadyInjected": True,
        "eventsEnqueued": 0,
    }
    assert sender.send_calls == []


def test_submit_v2_orders_reraises_and_allows_retry_when_send_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_store = FakeScenarioStateStore()
    failing_sender = FakeIncidentEventSender(
        error=RuntimeError("simulated Service Bus send failure")
    )
    monkeypatch.setattr(function_app, "_scenario_state_store", lambda: state_store)
    monkeypatch.setattr(function_app, "_event_sender", lambda: failing_sender)
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    )

    with pytest.raises(RuntimeError, match="simulated Service Bus send failure"):
        function_app.submit_v2_orders(_http_request(method="POST", route="submit-v2-orders"))

    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is False

    working_sender = FakeIncidentEventSender()
    monkeypatch.setattr(function_app, "_event_sender", lambda: working_sender)

    retry_response = function_app.submit_v2_orders(
        _http_request(method="POST", route="submit-v2-orders")
    )

    assert retry_response.status_code == 202
    assert json.loads(retry_response.get_body()) == {
        "incidentBatchAlreadyInjected": False,
        "eventsEnqueued": 20,
    }
    assert working_sender.send_calls == [build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True


def test_submit_v2_orders_recovers_a_pending_batch_after_a_failed_completion_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Regression test: a send that succeeds followed by a mark_batch_completed write
    # that fails must leave the batch reported as not injected (never a permanently
    # stuck pending claim), and a later retry must re-drive the same deterministic
    # batch to completion. A repeat submission after that must send nothing further.
    state_store = FakeScenarioStateStore()
    state_store.completion_error = RuntimeError("simulated Table Storage write failure")
    sender = FakeIncidentEventSender()
    monkeypatch.setattr(function_app, "_scenario_state_store", lambda: state_store)
    monkeypatch.setattr(function_app, "_event_sender", lambda: sender)
    monkeypatch.setattr(function_app, "_receipt_store", lambda: FakeReceiptStore())
    monkeypatch.delenv("DEPLOYED_COMMIT_SHA", raising=False)
    monkeypatch.delenv("DEPLOYED_AT_UTC", raising=False)
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    )

    with pytest.raises(RuntimeError, match="simulated Table Storage write failure"):
        function_app.submit_v2_orders(_http_request(method="POST", route="submit-v2-orders"))

    assert sender.send_calls == [build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is False

    status_response = function_app.workshop_status(_http_request(method="GET", route="status"))
    assert json.loads(status_response.get_body()) == {
        "incidentBatchId": INCIDENT_BATCH_ID,
        "incidentBatchInjected": False,
        "deployedCommitSha": None,
        "deployedAtUtc": None,
        "normalizedReceiptCount": 0,
        "v1ReceiptCount": 0,
        "v2ReceiptCount": 0,
    }

    state_store.completion_error = None
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC)
    )

    retry_response = function_app.submit_v2_orders(
        _http_request(method="POST", route="submit-v2-orders")
    )

    assert retry_response.status_code == 202
    assert json.loads(retry_response.get_body()) == {
        "incidentBatchAlreadyInjected": False,
        "eventsEnqueued": 20,
    }
    assert sender.send_calls == [build_incident_events_v2(), build_incident_events_v2()]
    assert state_store.is_batch_injected(INCIDENT_BATCH_ID) is True

    later_response = function_app.submit_v2_orders(
        _http_request(method="POST", route="submit-v2-orders")
    )

    assert later_response.status_code == 200
    assert json.loads(later_response.get_body()) == {
        "incidentBatchAlreadyInjected": True,
        "eventsEnqueued": 0,
    }
    assert sender.send_calls == [build_incident_events_v2(), build_incident_events_v2()]


def test_seed_v1_controls_enqueues_the_control_batch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_store = FakeScenarioStateStore()
    sender = FakeIncidentEventSender()
    monkeypatch.setattr(function_app, "_scenario_state_store", lambda: state_store)
    monkeypatch.setattr(function_app, "_event_sender", lambda: sender)
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    )

    response = function_app.seed_v1_controls(_http_request(method="POST", route="seed-v1-controls"))

    assert response.status_code == 202
    assert json.loads(response.get_body()) == {
        "controlBatchAlreadyInjected": False,
        "eventsEnqueued": 3,
    }
    assert sender.send_calls == [build_control_events_v1()]
    assert state_store.is_batch_injected(CONTROL_BATCH_ID) is True


def test_seed_v1_controls_is_idempotent_when_already_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = FakeIncidentEventSender()
    monkeypatch.setattr(
        function_app,
        "_scenario_state_store",
        lambda: FakeScenarioStateStore(already_injected=True),
    )
    monkeypatch.setattr(function_app, "_event_sender", lambda: sender)

    response = function_app.seed_v1_controls(_http_request(method="POST", route="seed-v1-controls"))

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "controlBatchAlreadyInjected": True,
        "eventsEnqueued": 0,
    }
    assert sender.send_calls == []


def test_function_app_registers_the_expected_keyed_functions_without_output_bindings() -> None:
    # azure-functions' FunctionApp.get_functions() accumulates function names across
    # calls and raises on a second invocation within the same process, so every
    # assertion needing the registered functions lives in this single test.
    registered = {fn.get_function_name(): fn for fn in function_app.app.get_functions()}

    assert set(registered) == {
        "ProcessOrderEvent",
        "WorkshopStatus",
        "SubmitV2Orders",
        "SeedV1Controls",
    }

    status_trigger = registered["WorkshopStatus"].get_trigger()
    assert status_trigger is not None
    assert status_trigger.auth_level.value == "function"

    submit_trigger = registered["SubmitV2Orders"].get_trigger()
    assert submit_trigger is not None
    assert submit_trigger.auth_level.value == "function"

    seed_trigger = registered["SeedV1Controls"].get_trigger()
    assert seed_trigger is not None
    assert seed_trigger.auth_level.value == "function"

    # The Python Service Bus queue output binding does not support sending a list of
    # messages per invocation, so SubmitV2Orders must send via the Service Bus SDK
    # instead of declaring a serviceBus output binding.
    submit_bindings = registered["SubmitV2Orders"].get_bindings()
    assert not any(
        binding.type == "serviceBus" and binding.direction == 1 for binding in submit_bindings
    )
