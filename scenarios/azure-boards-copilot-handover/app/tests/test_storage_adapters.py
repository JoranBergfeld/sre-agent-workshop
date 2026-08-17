from datetime import UTC, datetime

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.data.tables import UpdateMode

from order_events.adapters.storage import ReceiptTableStore, ScenarioStateTableStore
from order_events.normalizer import NormalizedReceipt


class FakeReceiptTableClient:
    def __init__(self) -> None:
        self.calls: list[tuple[dict[str, object], UpdateMode]] = []

    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> None:
        self.calls.append((entity, mode))


class FakeScenarioStateTableClient:
    def __init__(self) -> None:
        self.created_entities: list[dict[str, object]] = []
        self.entities: dict[tuple[str, str], dict[str, object]] = {}
        self.create_error: Exception | None = None

    def create_entity(self, entity: dict[str, object]) -> None:
        if self.create_error is not None:
            raise self.create_error
        self.created_entities.append(entity)
        self.entities[(str(entity["PartitionKey"]), str(entity["RowKey"]))] = entity

    def get_entity(self, *, partition_key: str, row_key: str) -> dict[str, object]:
        key = (partition_key, row_key)
        if key not in self.entities:
            raise ResourceNotFoundError("missing")
        return self.entities[key]


def test_receipt_store_upserts_receipts_idempotently_for_order_rows() -> None:
    table_client = FakeReceiptTableClient()
    store = ReceiptTableStore(table_client)

    store.upsert_receipt(
        NormalizedReceipt(
            sourceSchemaVersion="v1",
            customerId="customer-2001",
            amountMinor=1234,
            currency="USD",
            orderId="order-1001",
        ),
        processed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    assert table_client.calls == [
        (
            {
                "PartitionKey": "orders",
                "RowKey": "order-1001",
                "sourceSchemaVersion": "v1",
                "customerId": "customer-2001",
                "amountMinor": 1234,
                "currency": "USD",
                "processedAtUtc": "2026-08-17T13:52:55Z",
            },
            UpdateMode.REPLACE,
        )
    ]


def test_scenario_state_store_claims_an_incident_batch_once() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)

    created = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    assert created is True
    assert table_client.created_entities == [
        {
            "PartitionKey": "incidentBatches",
            "RowKey": "schema-drift-v2-incident",
            "eventCount": 20,
            "claimedAtUtc": "2026-08-17T13:52:55Z",
        }
    ]


def test_scenario_state_store_treats_resource_exists_as_already_injected() -> None:
    table_client = FakeScenarioStateTableClient()
    table_client.create_error = ResourceExistsError("duplicate")
    store = ScenarioStateTableStore(table_client)

    created = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    assert created is False


def test_scenario_state_store_checks_injection_status_from_table_state() -> None:
    table_client = FakeScenarioStateTableClient()
    table_client.entities[("incidentBatches", "schema-drift-v2-incident")] = {"eventCount": 20}
    store = ScenarioStateTableStore(table_client)

    assert store.is_batch_injected("schema-drift-v2-incident") is True
    assert store.is_batch_injected("missing-batch") is False
