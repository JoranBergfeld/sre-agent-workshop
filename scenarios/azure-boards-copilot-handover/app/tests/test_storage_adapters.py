from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime

from azure.core import MatchConditions
from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
from azure.data.tables import UpdateMode

from order_events.adapters.storage import ReceiptTableStore, ScenarioStateTableStore
from order_events.normalizer import NormalizedReceipt
from order_events.workshop import BatchClaim, ClaimOutcome, ReceiptCounts


class FakeReceiptTableClient:
    def __init__(self, *, entities: list[dict[str, object]] | None = None) -> None:
        self.calls: list[tuple[dict[str, object], UpdateMode]] = []
        self._entities = entities or []
        self.query_filters: list[tuple[str, Sequence[str] | None]] = []

    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> None:
        self.calls.append((entity, mode))

    def query_entities(
        self, query_filter: str, *, select: Sequence[str] | None = None
    ) -> list[Mapping[str, object]]:
        self.query_filters.append((query_filter, select))
        return list(self._entities)


class _FakeStoredEntity(dict[str, object]):
    """Mimics azure.data.tables.TableEntity: a dict plus an etag-bearing metadata."""

    def __init__(self, data: Mapping[str, object], etag: str) -> None:
        super().__init__(data)
        self.metadata: dict[str, object] = {"etag": etag}


class FakeScenarioStateTableClient:
    def __init__(self) -> None:
        self.created_entities: list[dict[str, object]] = []
        self.upserted_entities: list[tuple[dict[str, object], UpdateMode]] = []
        self.updated_entities: list[tuple[dict[str, object], UpdateMode, str]] = []
        self.deleted_keys: list[tuple[str, str]] = []
        self.entities: dict[tuple[str, str], dict[str, object]] = {}
        self.create_error: Exception | None = None
        # Invoked (if set) right before create_entity raises ResourceExistsError, to
        # simulate a racing caller deleting the row (e.g. releasing a failed claim)
        # between our failed create attempt and our subsequent get_entity read.
        self.create_conflict_side_effect: Callable[[], None] | None = None
        # Invoked (if set) right after a get_entity read returns, to simulate a racing
        # caller concurrently mutating the same row between our read and our
        # etag-conditional update_entity call.
        self.get_entity_side_effect: Callable[[], None] | None = None
        self.etags: dict[tuple[str, str], str] = {}
        self._etag_counter = 0

    def _bump_etag(self, key: tuple[str, str]) -> None:
        self._etag_counter += 1
        self.etags[key] = f"etag-{self._etag_counter}"

    def create_entity(self, entity: dict[str, object]) -> None:
        if self.create_error is not None:
            raise self.create_error
        key = (str(entity["PartitionKey"]), str(entity["RowKey"]))
        if key in self.entities:
            if self.create_conflict_side_effect is not None:
                self.create_conflict_side_effect()
            raise ResourceExistsError("duplicate")
        self.created_entities.append(entity)
        self.entities[key] = entity
        self._bump_etag(key)

    def get_entity(self, partition_key: str, row_key: str, **kwargs: object) -> _FakeStoredEntity:
        key = (partition_key, row_key)
        if key not in self.entities:
            raise ResourceNotFoundError("missing")
        entity = _FakeStoredEntity(self.entities[key], self.etags.get(key, "etag-0"))
        if self.get_entity_side_effect is not None:
            self.get_entity_side_effect()
        return entity

    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> None:
        self.upserted_entities.append((entity, mode))
        key = (str(entity["PartitionKey"]), str(entity["RowKey"]))
        merged = {**self.entities.get(key, {}), **entity}
        self.entities[key] = merged
        self._bump_etag(key)

    def update_entity(
        self,
        entity: dict[str, object],
        mode: UpdateMode,
        *,
        etag: str,
        match_condition: MatchConditions,
    ) -> None:
        key = (str(entity["PartitionKey"]), str(entity["RowKey"]))
        if key not in self.entities:
            raise ResourceNotFoundError("missing")
        if match_condition == MatchConditions.IfNotModified and self.etags.get(key) != etag:
            raise ResourceModifiedError("etag mismatch")
        self.updated_entities.append((entity, mode, etag))
        merged = {**self.entities[key], **entity}
        self.entities[key] = merged
        self._bump_etag(key)

    def delete_entity(self, partition_key: str, row_key: str, **kwargs: object) -> None:
        key = (partition_key, row_key)
        etag = kwargs.get("etag")
        match_condition = kwargs.get("match_condition")
        if key not in self.entities:
            raise ResourceNotFoundError("missing")
        if match_condition == MatchConditions.IfNotModified and self.etags.get(key) != etag:
            raise ResourceModifiedError("etag mismatch")
        self.deleted_keys.append((partition_key, row_key))
        self.etags.pop(key, None)
        self.entities.pop((partition_key, row_key), None)


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


def test_receipt_store_counts_receipts_split_by_schema_version() -> None:
    table_client = FakeReceiptTableClient(
        entities=[
            {"sourceSchemaVersion": "v1"},
            {"sourceSchemaVersion": "v1"},
            {"sourceSchemaVersion": "v1"},
            *({"sourceSchemaVersion": "v2"} for _ in range(20)),
        ]
    )
    store = ReceiptTableStore(table_client)

    counts = store.count_receipts()

    assert counts == ReceiptCounts(total=23, v1=3, v2=20)
    query_filter, select = table_client.query_filters[0]
    assert query_filter == "PartitionKey eq 'orders'"
    assert select == ["sourceSchemaVersion"]


def test_receipt_store_counts_zero_receipts_before_any_are_processed() -> None:
    table_client = FakeReceiptTableClient(entities=[])
    store = ReceiptTableStore(table_client)

    assert store.count_receipts() == ReceiptCounts(total=0, v1=0, v2=0)


def test_scenario_state_store_claims_an_incident_batch_once() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)

    created = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )
    assert created.outcome is ClaimOutcome.CLAIMED
    assert isinstance(created.claim_token, str)
    assert len(table_client.created_entities) == 1
    created_entity = table_client.created_entities[0]
    assert created_entity["PartitionKey"] == "incidentBatches"
    assert created_entity["RowKey"] == "schema-drift-v2-incident"
    assert created_entity["eventCount"] == 20
    assert created_entity["status"] == "pending"
    assert created_entity["claimedAtUtc"] == "2026-08-17T13:52:55Z"
    assert created_entity["claimToken"] == created.claim_token


def test_scenario_state_store_reports_already_completed_when_reclaiming_a_completed_batch() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    store.claim_batch(batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at)
    store.mark_batch_completed(
        "schema-drift-v2-incident", completed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC)
    )

    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 54, 0, tzinfo=UTC),
    )

    assert outcome == BatchClaim(outcome=ClaimOutcome.ALREADY_COMPLETED)
    # A completed batch must never be taken over: no conditional update_entity call.
    assert table_client.updated_entities == []


def test_scenario_state_store_keeps_completed_state_when_a_later_recovery_fails() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    first_claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=first_claimed_at
    )

    first_recovery = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC),
    )
    assert first_recovery.outcome is ClaimOutcome.RECOVERABLE
    assert isinstance(first_recovery.claim_token, str)

    second_recovery = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 20, tzinfo=UTC),
    )
    assert second_recovery.outcome is ClaimOutcome.RECOVERABLE
    assert isinstance(second_recovery.claim_token, str)

    store.mark_batch_completed(
        "schema-drift-v2-incident", completed_at=datetime(2026, 8, 17, 13, 53, 21, tzinfo=UTC)
    )
    store.release_batch_claim("schema-drift-v2-incident", claim_token=second_recovery.claim_token)

    assert store.is_batch_injected("schema-drift-v2-incident") is True
    assert store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 30, tzinfo=UTC),
    ) == BatchClaim(outcome=ClaimOutcome.ALREADY_COMPLETED)


def test_scenario_state_store_contests_a_fresh_pending_claim() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 0, tzinfo=UTC),
    )

    assert outcome == BatchClaim(outcome=ClaimOutcome.CONTESTED)
    assert table_client.updated_entities == []
    assert store.is_batch_injected("schema-drift-v2-incident") is False


def test_scenario_state_store_recovers_a_pending_claim_via_a_conditional_update() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    first_claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=first_claimed_at
    )
    original_etag = table_client.etags[("incidentBatches", "schema-drift-v2-incident")]

    retry_claimed_at = datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC)
    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=retry_claimed_at
    )

    assert outcome.outcome is ClaimOutcome.RECOVERABLE
    assert isinstance(outcome.claim_token, str)
    assert len(table_client.updated_entities) == 1
    updated_entity, mode, etag_used = table_client.updated_entities[0]
    assert etag_used == original_etag
    assert mode is UpdateMode.MERGE
    assert updated_entity["status"] == "pending"
    assert updated_entity["claimedAtUtc"] == "2026-08-17T13:53:10Z"
    assert updated_entity["claimToken"] == outcome.claim_token
    # Recovering a claim does not by itself complete it.
    assert store.is_batch_injected("schema-drift-v2-incident") is False


def test_scenario_state_store_is_contested_when_a_racing_caller_wins_the_recovery() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    store.claim_batch(batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at)

    def _racing_caller_recovers_first() -> None:
        table_client.update_entity(
            {
                "PartitionKey": "incidentBatches",
                "RowKey": "schema-drift-v2-incident",
                "status": "pending",
                "claimedAtUtc": "2026-08-17T13:53:00Z",
                "claimToken": "racing-caller-token",
            },
            mode=UpdateMode.MERGE,
            etag=table_client.etags[("incidentBatches", "schema-drift-v2-incident")],
            match_condition=MatchConditions.IfNotModified,
        )

    table_client.get_entity_side_effect = _racing_caller_recovers_first

    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC),
    )

    assert outcome == BatchClaim(outcome=ClaimOutcome.CONTESTED)
    # Only the racing caller's own conditional update succeeded; ours must not have.
    assert len(table_client.updated_entities) == 1
    assert table_client.updated_entities[0][0]["claimToken"] == "racing-caller-token"
    assert store.is_batch_injected("schema-drift-v2-incident") is False


def test_scenario_state_store_is_contested_when_the_pending_claim_disappears_mid_recovery() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    initial_claim = store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at
    )
    assert isinstance(initial_claim.claim_token, str)

    def _racing_caller_releases_the_claim() -> None:
        table_client.get_entity_side_effect = None
        store.release_batch_claim("schema-drift-v2-incident", claim_token=initial_claim.claim_token)

    table_client.get_entity_side_effect = _racing_caller_releases_the_claim

    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC),
    )

    assert outcome == BatchClaim(outcome=ClaimOutcome.CONTESTED)
    assert store.is_batch_injected("schema-drift-v2-incident") is False


def test_scenario_state_store_is_contested_when_claim_vanishes_before_recovery_read() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    initial_claim = store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at
    )
    assert isinstance(initial_claim.claim_token, str)

    def _racing_caller_releases_the_claim() -> None:
        store.release_batch_claim("schema-drift-v2-incident", claim_token=initial_claim.claim_token)

    table_client.create_conflict_side_effect = _racing_caller_releases_the_claim

    outcome = store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC),
    )

    assert outcome == BatchClaim(outcome=ClaimOutcome.CONTESTED)
    assert store.is_batch_injected("schema-drift-v2-incident") is False


def test_scenario_state_store_reports_not_injected_while_pending() -> None:
    table_client = FakeScenarioStateTableClient()
    table_client.entities[("incidentBatches", "schema-drift-v2-incident")] = {
        "eventCount": 20,
        "status": "pending",
    }
    store = ScenarioStateTableStore(table_client)

    assert store.is_batch_injected("schema-drift-v2-incident") is False
    assert store.is_batch_injected("missing-batch") is False


def test_scenario_state_store_reports_injected_only_once_completed() -> None:
    table_client = FakeScenarioStateTableClient()
    table_client.entities[("incidentBatches", "schema-drift-v2-incident")] = {
        "eventCount": 20,
        "status": "completed",
    }
    store = ScenarioStateTableStore(table_client)

    assert store.is_batch_injected("schema-drift-v2-incident") is True


def test_scenario_state_store_marks_a_claimed_batch_completed() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    store.claim_batch(
        batch_id="schema-drift-v2-incident",
        event_count=20,
        claimed_at=datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC),
    )

    store.mark_batch_completed(
        "schema-drift-v2-incident",
        completed_at=datetime(2026, 8, 17, 13, 53, 10, tzinfo=UTC),
    )

    assert table_client.upserted_entities == [
        (
            {
                "PartitionKey": "incidentBatches",
                "RowKey": "schema-drift-v2-incident",
                "status": "completed",
                "completedAtUtc": "2026-08-17T13:53:10Z",
            },
            UpdateMode.MERGE,
        )
    ]
    assert store.is_batch_injected("schema-drift-v2-incident") is True


def test_scenario_state_store_releases_a_claim_so_it_can_be_retried() -> None:
    table_client = FakeScenarioStateTableClient()
    store = ScenarioStateTableStore(table_client)
    claimed_at = datetime(2026, 8, 17, 13, 52, 55, tzinfo=UTC)
    claim = store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at
    )
    assert claim.outcome is ClaimOutcome.CLAIMED
    assert isinstance(claim.claim_token, str)
    store.release_batch_claim("schema-drift-v2-incident", claim_token=claim.claim_token)

    assert table_client.deleted_keys == [("incidentBatches", "schema-drift-v2-incident")]
    assert store.is_batch_injected("schema-drift-v2-incident") is False

    reclaimed = store.claim_batch(
        batch_id="schema-drift-v2-incident", event_count=20, claimed_at=claimed_at
    )
    assert reclaimed.outcome is ClaimOutcome.CLAIMED
