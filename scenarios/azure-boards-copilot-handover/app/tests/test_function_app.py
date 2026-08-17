import json
from datetime import UTC, datetime

import azure.functions as func
import pytest

import function_app
from order_events.batches import INCIDENT_BATCH_ID, build_incident_events_v2
from order_events.normalizer import NormalizedReceipt


class FakeReceiptStore:
    def __init__(self) -> None:
        self.calls: list[tuple[NormalizedReceipt, datetime]] = []

    def upsert_receipt(self, receipt: NormalizedReceipt, *, processed_at: datetime) -> None:
        self.calls.append((receipt, processed_at))


class FakeScenarioStateStore:
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


class FakeServiceBusMessage:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def get_body(self) -> bytes:
        return self._body


class FakeQueueOutput:
    def __init__(self) -> None:
        self.set_calls: list[list[str]] = []

    def set(self, value: list[str]) -> None:
        self.set_calls.append(value)


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

    response = function_app.workshop_status(_http_request(method="GET", route="status"))

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "incidentBatchId": INCIDENT_BATCH_ID,
        "incidentBatchInjected": True,
    }


def test_submit_v2_orders_enqueues_the_incident_batch_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_store = FakeScenarioStateStore()
    monkeypatch.setattr(function_app, "_scenario_state_store", lambda: state_store)
    monkeypatch.setattr(
        function_app, "_clock", lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    )
    queue_output = FakeQueueOutput()

    response = function_app.submit_v2_orders(
        _http_request(method="POST", route="submit-v2-orders"), queue_output
    )

    assert response.status_code == 202
    assert json.loads(response.get_body()) == {
        "incidentBatchAlreadyInjected": False,
        "eventsEnqueued": 20,
    }
    assert queue_output.set_calls == [[json.dumps(event) for event in build_incident_events_v2()]]


def test_submit_v2_orders_is_idempotent_when_already_injected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        function_app,
        "_scenario_state_store",
        lambda: FakeScenarioStateStore(already_injected=True),
    )
    queue_output = FakeQueueOutput()

    response = function_app.submit_v2_orders(
        _http_request(method="POST", route="submit-v2-orders"), queue_output
    )

    assert response.status_code == 200
    assert json.loads(response.get_body()) == {
        "incidentBatchAlreadyInjected": True,
        "eventsEnqueued": 0,
    }
    assert queue_output.set_calls == []


def test_function_app_registers_the_expected_keyed_functions() -> None:
    registered = {fn.get_function_name(): fn for fn in function_app.app.get_functions()}

    assert set(registered) == {"ProcessOrderEvent", "WorkshopStatus", "SubmitV2Orders"}

    status_trigger = registered["WorkshopStatus"].get_trigger()
    assert status_trigger is not None
    assert status_trigger.auth_level.value == "function"

    submit_trigger = registered["SubmitV2Orders"].get_trigger()
    assert submit_trigger is not None
    assert submit_trigger.auth_level.value == "function"
