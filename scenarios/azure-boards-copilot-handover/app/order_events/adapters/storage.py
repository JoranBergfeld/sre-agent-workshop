from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import uuid4

from azure.core import MatchConditions
from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
from azure.data.tables import UpdateMode

from order_events.normalizer import NormalizedReceipt
from order_events.workshop import BatchClaim, ClaimOutcome


class ReceiptTableClient(Protocol):
    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> object: ...


class StoredBatchEntity(Protocol):
    """Structural match for azure.data.tables.TableEntity: a mapping plus an etag."""

    def __getitem__(self, key: str) -> object: ...

    def __contains__(self, key: object) -> bool: ...

    def get(self, key: str, default: object | None = None) -> object: ...

    @property
    def metadata(self) -> Mapping[str, object]: ...


class ScenarioStateTableClient(Protocol):
    def create_entity(self, entity: dict[str, object]) -> object: ...

    def get_entity(
        self, partition_key: str, row_key: str, **kwargs: object
    ) -> StoredBatchEntity: ...

    def upsert_entity(self, entity: dict[str, object], mode: UpdateMode) -> object: ...

    def update_entity(
        self,
        entity: dict[str, object],
        mode: UpdateMode,
        *,
        etag: str,
        match_condition: MatchConditions,
    ) -> object: ...

    def delete_entity(self, partition_key: str, row_key: str, **kwargs: object) -> None: ...


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
_PENDING_STATUS = "pending"
_COMPLETED_STATUS = "completed"
_PENDING_CLAIM_RECOVERY_DELAY = timedelta(seconds=10)


class ScenarioStateTableStore:
    def __init__(self, table_client: ScenarioStateTableClient) -> None:
        self._table_client = table_client

    def claim_batch(self, *, batch_id: str, event_count: int, claimed_at: datetime) -> BatchClaim:
        claim_token = str(uuid4())
        try:
            self._table_client.create_entity(
                {
                    "PartitionKey": _INCIDENT_BATCHES_PARTITION_KEY,
                    "RowKey": batch_id,
                    "eventCount": event_count,
                    "status": _PENDING_STATUS,
                    "claimedAtUtc": _format_utc(claimed_at),
                    "claimToken": claim_token,
                }
            )
        except ResourceExistsError:
            return self._recover_pending_claim(batch_id, claimed_at=claimed_at)

        return BatchClaim(outcome=ClaimOutcome.CLAIMED, claim_token=claim_token)

    def _recover_pending_claim(self, batch_id: str, *, claimed_at: datetime) -> BatchClaim:
        """Decide whether an already-claimed batch is completed or recoverable.

        A batch stays "pending" in Table Storage if a previous attempt's Service Bus
        send succeeded but the follow-up completion write never landed (for example a
        transient Table Storage failure). That is an intentional at-least-once
        recovery path once the claim has aged past the short active-send window below:
        the incident batch is deterministic and downstream receipt handling is
        idempotent, so re-sending and completing it then is safe. Fresh pending claims
        are treated as still-owned by another caller so concurrent submit-v2-orders
        requests do not race into duplicate sends. Taking over an eligible stale claim
        is still done with an etag-conditional update so that at most one of several
        concurrent recoverers wins; a caller that loses the race (or finds the claim
        already completed or released underneath it) backs off instead of resending.
        """
        try:
            entity = self._table_client.get_entity(_INCIDENT_BATCHES_PARTITION_KEY, batch_id)
        except ResourceNotFoundError:
            return BatchClaim(outcome=ClaimOutcome.CONTESTED)

        if "status" in entity and entity["status"] == _COMPLETED_STATUS:
            return BatchClaim(outcome=ClaimOutcome.ALREADY_COMPLETED)

        if not _pending_claim_is_stale(entity, claimed_at=claimed_at):
            return BatchClaim(outcome=ClaimOutcome.CONTESTED)

        claim_token = str(uuid4())
        try:
            self._table_client.update_entity(
                {
                    "PartitionKey": _INCIDENT_BATCHES_PARTITION_KEY,
                    "RowKey": batch_id,
                    "status": _PENDING_STATUS,
                    "claimedAtUtc": _format_utc(claimed_at),
                    "claimToken": claim_token,
                },
                mode=UpdateMode.MERGE,
                etag=str(entity.metadata["etag"]),
                match_condition=MatchConditions.IfNotModified,
            )
        except (ResourceModifiedError, ResourceNotFoundError):
            return BatchClaim(outcome=ClaimOutcome.CONTESTED)

        return BatchClaim(outcome=ClaimOutcome.RECOVERABLE, claim_token=claim_token)

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

    def release_batch_claim(self, batch_id: str, *, claim_token: str) -> None:
        try:
            entity = self._table_client.get_entity(_INCIDENT_BATCHES_PARTITION_KEY, batch_id)
        except ResourceNotFoundError:
            return

        if "status" in entity and entity["status"] == _COMPLETED_STATUS:
            return

        if entity.get("claimToken") != claim_token:
            return

        try:
            self._table_client.delete_entity(
                _INCIDENT_BATCHES_PARTITION_KEY,
                batch_id,
                etag=str(entity.metadata["etag"]),
                match_condition=MatchConditions.IfNotModified,
            )
        except (ResourceModifiedError, ResourceNotFoundError):
            return

    def is_batch_injected(self, batch_id: str) -> bool:
        try:
            entity = self._table_client.get_entity(_INCIDENT_BATCHES_PARTITION_KEY, batch_id)
        except ResourceNotFoundError:
            return False

        return "status" in entity and entity["status"] == _COMPLETED_STATUS


def _format_utc(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _pending_claim_is_stale(entity: StoredBatchEntity, *, claimed_at: datetime) -> bool:
    claimed_at_raw = entity.get("claimedAtUtc", None)
    if not isinstance(claimed_at_raw, str):
        return True

    try:
        stored_claimed_at = datetime.fromisoformat(claimed_at_raw.replace("Z", "+00:00"))
    except ValueError:
        return True

    return (
        claimed_at.astimezone(UTC) - stored_claimed_at.astimezone(UTC)
        >= _PENDING_CLAIM_RECOVERY_DELAY
    )
