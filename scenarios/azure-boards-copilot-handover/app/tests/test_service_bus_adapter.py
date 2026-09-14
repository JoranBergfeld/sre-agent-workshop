import json
import logging
from datetime import UTC, datetime

import pytest

from order_events.adapters.service_bus import RetrySettings, process_order_event_message
from order_events.normalizer import (
    InvalidReceiptEventError,
    NormalizedReceipt,
    UnsupportedReceiptSchemaError,
)


class FakeMessage:
    def __init__(self, body: bytes) -> None:
        self._body = body

    def get_body(self) -> bytes:
        return self._body


class FakeReceiptStore:
    def __init__(self) -> None:
        self.calls: list[tuple[NormalizedReceipt, datetime]] = []

    def upsert_receipt(self, receipt: NormalizedReceipt, *, processed_at: datetime) -> None:
        self.calls.append((receipt, processed_at))


def test_process_order_event_message_persists_supported_receipts() -> None:
    receipt_store = FakeReceiptStore()

    process_order_event_message(
        FakeMessage(
            b'{"schemaVersion":"v1","orderId":"order-1001","customerId":"customer-2001",'
            b'"total":"12.34","currency":"USD"}'
        ),
        receipt_store=receipt_store,
        clock=lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    assert receipt_store.calls == [
        (
            NormalizedReceipt(
                sourceSchemaVersion="v1",
                customerId="customer-2001",
                amountMinor=1234,
                currency="USD",
                orderId="order-1001",
            ),
            datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
        )
    ]


def test_process_order_event_message_logs_persisted_receipt_telemetry(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO):
        process_order_event_message(
            FakeMessage(
                b'{"schemaVersion":"v1","orderId":"order-1001","customerId":"customer-2001",'
                b'"total":"12.34","currency":"USD"}'
            ),
            receipt_store=FakeReceiptStore(),
            clock=lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
        )

    record = next(
        record
        for record in caplog.records
        if record.message.startswith("Normalized receipt persisted ")
    )
    telemetry = json.loads(record.message.removeprefix("Normalized receipt persisted "))
    assert telemetry == {
        "amount_minor": 1234,
        "currency": "USD",
        "customer_id": "customer-2001",
        "order_id": "order-1001",
        "source_schema_version": "v1",
    }


def test_process_order_event_message_delays_and_reraises_unsupported_events() -> None:
    receipt_store = FakeReceiptStore()
    sleep_calls: list[float] = []

    with pytest.raises(UnsupportedReceiptSchemaError):
        process_order_event_message(
            FakeMessage(b"{}"),
            receipt_store=receipt_store,
            normalizer=lambda _: (_ for _ in ()).throw(UnsupportedReceiptSchemaError("v2")),
            retry_settings=RetrySettings(delay_seconds=45, max_delay_seconds=30),
            sleep=sleep_calls.append,
            clock=lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
        )

    assert receipt_store.calls == []
    assert sleep_calls == [30]


def test_process_order_event_message_reraises_invalid_events_without_delay() -> None:
    sleep_calls: list[float] = []

    with pytest.raises(InvalidReceiptEventError):
        process_order_event_message(
            FakeMessage(b"{}"),
            receipt_store=FakeReceiptStore(),
            normalizer=lambda _: (_ for _ in ()).throw(InvalidReceiptEventError("invalid")),
            retry_settings=RetrySettings(delay_seconds=5, max_delay_seconds=30),
            sleep=sleep_calls.append,
            clock=lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
        )

    assert sleep_calls == []


def test_process_order_event_message_rejects_invalid_json() -> None:
    with pytest.raises(InvalidReceiptEventError, match="message body must be valid UTF-8 JSON"):
        process_order_event_message(
            FakeMessage(b"{"),
            receipt_store=FakeReceiptStore(),
            clock=lambda: datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
        )
