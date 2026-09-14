from order_events.contracts import ReceiptEventV1, ReceiptEventV2

INCIDENT_BATCH_ID = "schema-drift-v2-incident"
CONTROL_BATCH_ID = "v1-control-events"


def build_control_events_v1() -> tuple[ReceiptEventV1, ReceiptEventV1, ReceiptEventV1]:
    return (
        {
            "schemaVersion": "v1",
            "orderId": "control-order-001",
            "customerId": "control-customer-001",
            "total": "11.25",
            "currency": "USD",
        },
        {
            "schemaVersion": "v1",
            "orderId": "control-order-002",
            "customerId": "control-customer-002",
            "total": "24.50",
            "currency": "USD",
        },
        {
            "schemaVersion": "v1",
            "orderId": "control-order-003",
            "customerId": "control-customer-003",
            "total": "7.75",
            "currency": "USD",
        },
    )


def build_incident_events_v2() -> tuple[ReceiptEventV2, ...]:
    return tuple(_build_incident_event(index) for index in range(1, 21))


def _build_incident_event(index: int) -> ReceiptEventV2:
    return {
        "schemaVersion": "v2",
        "id": f"incident-order-{index:03d}",
        "customer": {
            "id": f"incident-customer-{index:03d}",
        },
        "amount": {
            "value": f"{100 + index}.50",
            "currency": "USD",
        },
    }
