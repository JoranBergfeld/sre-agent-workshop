import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from order_events.normalizer import (
    InvalidReceiptEventError,
    NormalizedReceipt,
    UnsupportedReceiptSchemaError,
    normalize_receipt,
)


class InboundOrderEventMessage(Protocol):
    def get_body(self) -> bytes: ...


class ReceiptStore(Protocol):
    def upsert_receipt(self, receipt: NormalizedReceipt, *, processed_at: datetime) -> None: ...


@dataclass(frozen=True, slots=True)
class RetrySettings:
    delay_seconds: float = 5.0
    max_delay_seconds: float = 30.0


_DEFAULT_RETRY_SETTINGS = RetrySettings()


def process_order_event_message(
    message: InboundOrderEventMessage,
    *,
    receipt_store: ReceiptStore,
    normalizer: Callable[[object], NormalizedReceipt] = normalize_receipt,
    retry_settings: RetrySettings = _DEFAULT_RETRY_SETTINGS,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> None:
    payload = _decode_json_body(message.get_body())

    try:
        receipt = normalizer(payload)
    except UnsupportedReceiptSchemaError:
        sleep(min(retry_settings.delay_seconds, retry_settings.max_delay_seconds))
        raise

    receipt_store.upsert_receipt(receipt, processed_at=clock())


def _decode_json_body(body: bytes) -> object:
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InvalidReceiptEventError("message body must be valid UTF-8 JSON") from error
