"""Acceptance criteria for the follow-up, normalizer-only Copilot repair.

These tests describe the backward-compatible v2 order-event normalization
that Copilot's future repair must add. They intentionally fail against the
current, intentionally v1-only normalizer: valid v2 payloads still raise
``UnsupportedReceiptSchemaError`` until the repair adds v2 support. Run them
separately with ``pytest -m repair``; the default test run excludes them.
"""

import pytest

from order_events.normalizer import NormalizedReceipt, normalize_receipt

pytestmark = pytest.mark.repair


def test_normalize_v2_receipt_maps_nested_fields_to_minor_units() -> None:
    normalized = normalize_receipt(
        {
            "schemaVersion": "v2",
            "id": " incident-order-001 ",
            "customer": {"id": " incident-customer-001 "},
            "amount": {"value": "100.50", "currency": "usd"},
        }
    )

    assert normalized == NormalizedReceipt(
        sourceSchemaVersion="v2",
        customerId="incident-customer-001",
        amountMinor=10050,
        currency="USD",
        orderId="incident-order-001",
    )


@pytest.mark.parametrize(
    ("index", "expected_amount_minor"),
    [
        (1, 10150),
        (20, 12050),
    ],
)
def test_normalize_v2_receipt_accepts_every_incident_batch_event(
    index: int, expected_amount_minor: int
) -> None:
    normalized = normalize_receipt(
        {
            "schemaVersion": "v2",
            "id": f"incident-order-{index:03d}",
            "customer": {"id": f"incident-customer-{index:03d}"},
            "amount": {"value": f"{100 + index}.50", "currency": "USD"},
        }
    )

    assert normalized == NormalizedReceipt(
        sourceSchemaVersion="v2",
        customerId=f"incident-customer-{index:03d}",
        amountMinor=expected_amount_minor,
        currency="USD",
        orderId=f"incident-order-{index:03d}",
    )
