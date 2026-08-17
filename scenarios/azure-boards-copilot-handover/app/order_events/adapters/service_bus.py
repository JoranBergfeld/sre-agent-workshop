import json
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, Self

from azure.core.credentials import TokenCredential
from azure.servicebus import ServiceBusClient, ServiceBusMessage

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


class IncidentEventSender(Protocol):
    """Seam function_app/workshop code depends on to submit the incident batch."""

    def send_events(self, events: Sequence[Mapping[str, object]]) -> None: ...


class QueueSender(Protocol):
    """Structural match for azure.servicebus.ServiceBusSender's context-manager send API."""

    def __enter__(self) -> Self: ...

    def __exit__(self, *exc_info: object) -> None: ...

    def send_messages(self, messages: list[ServiceBusMessage], /) -> None: ...


class QueueSenderClient(Protocol):
    """Structural match for azure.servicebus.ServiceBusClient's context-manager sender factory."""

    def __enter__(self) -> Self: ...

    def __exit__(self, *exc_info: object) -> None: ...

    def get_queue_sender(self, *, queue_name: str) -> QueueSender: ...


def _default_client_factory(
    fully_qualified_namespace: str, credential: TokenCredential
) -> ServiceBusClient:
    return ServiceBusClient(
        fully_qualified_namespace=fully_qualified_namespace, credential=credential
    )


class ServiceBusIncidentEventSender:
    """Sends the incident batch through the Service Bus SDK's sender, not an output binding.

    The Python Service Bus queue output binding only supports a single message per
    invocation; there is no supported way to submit a list of messages through it. This
    adapter uses ``azure.servicebus.ServiceBusClient``/``ServiceBusSender.send_messages``
    directly with ``DefaultAzureCredential`` instead.
    """

    def __init__(
        self,
        *,
        fully_qualified_namespace: str,
        queue_name: str,
        credential: TokenCredential,
        client_factory: Callable[
            [str, TokenCredential], QueueSenderClient
        ] = _default_client_factory,
    ) -> None:
        self._fully_qualified_namespace = fully_qualified_namespace
        self._queue_name = queue_name
        self._credential = credential
        self._client_factory = client_factory

    def send_events(self, events: Sequence[Mapping[str, object]]) -> None:
        messages = [ServiceBusMessage(json.dumps(event)) for event in events]
        with (
            self._client_factory(self._fully_qualified_namespace, self._credential) as client,
            client.get_queue_sender(queue_name=self._queue_name) as sender,
        ):
            sender.send_messages(messages)


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
