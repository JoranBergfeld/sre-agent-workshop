from order_events.batches import (
    CONTROL_BATCH_ID,
    INCIDENT_BATCH_ID,
    build_control_events_v1,
    build_incident_events_v2,
)


def test_control_batch_id_is_stable_and_distinct_from_the_incident_batch() -> None:
    assert CONTROL_BATCH_ID == "v1-control-events"
    assert CONTROL_BATCH_ID != INCIDENT_BATCH_ID


def test_control_batch_contains_exactly_three_v1_events_with_stable_ids() -> None:
    control_events = build_control_events_v1()

    assert [event["orderId"] for event in control_events] == [
        "control-order-001",
        "control-order-002",
        "control-order-003",
    ]
    assert all(event["schemaVersion"] == "v1" for event in control_events)


def test_incident_batch_contains_twenty_valid_v2_events_with_stable_ids() -> None:
    incident_events = build_incident_events_v2()

    assert INCIDENT_BATCH_ID == "schema-drift-v2-incident"
    assert len(incident_events) == 20
    assert incident_events[0]["id"] == "incident-order-001"
    assert incident_events[-1]["id"] == "incident-order-020"
    assert all(event["schemaVersion"] == "v2" for event in incident_events)
    assert all(
        event["customer"]["id"].startswith("incident-customer-") for event in incident_events
    )
    assert all(event["amount"]["currency"] == "USD" for event in incident_events)
