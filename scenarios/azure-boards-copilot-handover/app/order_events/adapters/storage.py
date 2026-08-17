from datetime import UTC, datetime
from typing import Protocol

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.data.tables import UpdateMode

from order_events.normalizer import NormalizedReceipt


class ReceiptTableClient(Protocol):
    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> object: ...


class ScenarioStateTableClient(Protocol):
    def create_entity(self, entity: dict[str, object]) -> object: ...

    def get_entity(self, *, partition_key: str, row_key: str) -> dict[str, object]: ...

    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> object: ...

    def delete_entity(self, *, partition_key: str, row_key: str) -> None: ...


class ReceiptTableStore:
    def __init__(self, table_client: ReceiptTableClient) -> None:
        self._table_client = table_client

    def upsert_receipt(self, receipt: NormalizedReceipt, *, processed_at: datetime) -> None:
        self._table_client.upsert_entity(
            {
                "PartitionKey": "orders",
                "RowKey": receipt.orderId,
                "sourceSchemaVersion": receipt.sourceSchemaVersion,
                "customerId": receipt.customerId,
                "amountMinor": receipt.amountMinor,
                "currency": receipt.currency,
                "processedAtUtc": _format_utc(processed_at),
            },
            mode=UpdateMode.REPLACE,
        )


_INCIDENT_BATCHES_PARTITION_KEY = "incidentBatches"
_COMPLETED_STATUS = "completed"


class ScenarioStateTableStore:
    def __init__(self, table_client: ScenarioStateTableClient) -> None:
        self._table_client = table_client

    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> bool:
        try:
            self._table_client.create_entity(
                {
                    "PartitionKey": _INCIDENT_BATCHES_PARTITION_KEY,
                    "RowKey": batch_id,
                    "eventCount": event_count,
                    "status": "pending",
                    "claimedAtUtc": _format_utc(claimed_at),
                }
            )
        except ResourceExistsError:
            return False

        return True

    def mark_batch_completed(self, batch_id: str, *, completed_at: datetime) -> None:
        self._table_client.upsert_entity(
            {
                "PartitionKey": _INCIDENT_BATCHES_PARTITION_KEY,
                "RowKey": batch_id,
                "status": _COMPLETED_STATUS,
                "completedAtUtc": _format_utc(completed_at),
            },
            mode=UpdateMode.MERGE,
        )

    def release_batch_claim(self, batch_id: str) -> None:
        self._table_client.delete_entity(
            partition_key=_INCIDENT_BATCHES_PARTITION_KEY, row_key=batch_id
        )

    def is_batch_injected(self, batch_id: str) -> bool:
        try:
            entity = self._table_client.get_entity(
                partition_key=_INCIDENT_BATCHES_PARTITION_KEY, row_key=batch_id
            )
        except ResourceNotFoundError:
            return False

        return entity.get("status") == _COMPLETED_STATUS


def _format_utc(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
