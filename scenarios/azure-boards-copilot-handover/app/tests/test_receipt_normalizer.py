from dataclasses import FrozenInstanceError

import pytest

from order_events.normalizer import (
    InvalidReceiptEventError,
    NormalizedReceipt,
    UnsupportedReceiptSchemaError,
    normalize_receipt,
)


def test_normalize_v1_receipt_uses_minor_units_and_normalized_fields() -> None:
    normalized = normalize_receipt(
        {
            "schemaVersion": "v1",
            "orderId": " order-1001 ",
            "customerId": " customer-2001 ",
            "total": "12.34",
            "currency": "usd",
        }
    )

    assert normalized == NormalizedReceipt(
        sourceSchemaVersion="v1",
        customerId="customer-2001",
        amountMinor=1234,
        currency="USD",
        orderId="order-1001",
    )


def test_normalized_receipt_is_immutable() -> None:
    normalized = NormalizedReceipt(
        sourceSchemaVersion="v1",
        customerId="customer-2001",
        amountMinor=1234,
        currency="USD",
        orderId="order-1001",
    )

    with pytest.raises(FrozenInstanceError):
        normalized.amountMinor = 999


def test_normalize_receipt_raises_unsupported_schema_error_for_valid_v2_payload() -> None:
    with pytest.raises(UnsupportedReceiptSchemaError, match="schemaVersion 'v2' is not supported"):
        normalize_receipt(
            {
                "schemaVersion": "v2",
                "id": "incident-order-001",
                "customer": {"id": "incident-customer-001"},
                "amount": {"value": "100.50", "currency": "USD"},
            }
        )


@pytest.mark.parametrize(
    ("payload", "expected_message"),
    [
        ({}, "schemaVersion is required"),
        ("not-a-mapping", "payload must be an object"),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "",
                "total": "12.34",
                "currency": "USD",
            },
            "customerId must be a non-empty string",
        ),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": "-1.00",
                "currency": "USD",
            },
            "total must be a non-negative amount with at most 2 decimal places",
        ),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": "12.345",
                "currency": "USD",
            },
            "total must be a non-negative amount with at most 2 decimal places",
        ),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": None,
                "currency": "USD",
            },
            "total must be a non-negative amount with at most 2 decimal places",
        ),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": "not-a-number",
                "currency": "USD",
            },
            "total must be a non-negative amount with at most 2 decimal places",
        ),
        (
            {
                "schemaVersion": "v1",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": "12.34",
                "currency": "US",
            },
            "currency must be a three-letter alphabetic code",
        ),
        (
            {
                "schemaVersion": "v3",
                "orderId": "order-1001",
                "customerId": "customer-2001",
                "total": "12.34",
                "currency": "USD",
            },
            "schemaVersion must be one of: v1, v2",
        ),
    ],
)
def test_normalize_receipt_rejects_invalid_payloads(payload: object, expected_message: str) -> None:
    with pytest.raises(InvalidReceiptEventError, match=expected_message):
        normalize_receipt(payload)
