import json

from azure.servicebus import ServiceBusClient, ServiceBusMessage

from order_events.adapters import service_bus as service_bus_module
from order_events.adapters.service_bus import ServiceBusIncidentEventSender


class FakeQueueSender:
    def __init__(self) -> None:
        self.sent_messages: list[list[ServiceBusMessage]] = []
        self.closed = False

    def __enter__(self) -> "FakeQueueSender":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.closed = True

    def send_messages(self, messages: list[ServiceBusMessage]) -> None:
        self.sent_messages.append(list(messages))


class FakeServiceBusClient:
    def __init__(self, sender: FakeQueueSender) -> None:
        self._sender = sender
        self.requested_queue_names: list[str] = []
        self.closed = False

    def __enter__(self) -> "FakeServiceBusClient":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.closed = True

    def get_queue_sender(self, *, queue_name: str) -> FakeQueueSender:
        self.requested_queue_names.append(queue_name)
        return self._sender


class FakeCredential:
    """A stand-in for DefaultAzureCredential; token retrieval is the SDK's job, not ours."""


def test_default_client_factory_builds_a_real_service_bus_client_without_network_calls() -> None:
    class TokenlessCredential(FakeCredential):
        def get_token(self, *scopes: str, **kwargs: object) -> object:
            raise AssertionError("client construction must not fetch a token eagerly")

    credential = TokenlessCredential()

    client = service_bus_module._default_client_factory(
        "sb-namespace.servicebus.windows.net", credential
    )

    assert isinstance(client, ServiceBusClient)


def test_service_bus_incident_event_sender_sends_real_service_bus_messages() -> None:
    queue_sender = FakeQueueSender()
    client = FakeServiceBusClient(queue_sender)
    credential = FakeCredential()
    factory_calls: list[tuple[str, object]] = []

    def client_factory(
        fully_qualified_namespace: str, factory_credential: object
    ) -> FakeServiceBusClient:
        factory_calls.append((fully_qualified_namespace, factory_credential))
        return client

    sender = ServiceBusIncidentEventSender(
        fully_qualified_namespace="sb-namespace.servicebus.windows.net",
        queue_name="order-events",
        credential=credential,
        client_factory=client_factory,
    )
    events = [
        {"schemaVersion": "v2", "id": "incident-order-001"},
        {"schemaVersion": "v2", "id": "incident-order-002"},
    ]

    sender.send_events(events)

    assert factory_calls == [("sb-namespace.servicebus.windows.net", credential)]
    assert client.requested_queue_names == ["order-events"]
    assert len(queue_sender.sent_messages) == 1
    sent_messages = queue_sender.sent_messages[0]
    assert all(isinstance(message, ServiceBusMessage) for message in sent_messages)
    assert [str(message) for message in sent_messages] == [json.dumps(event) for event in events]
    assert client.closed is True
    assert queue_sender.closed is True


def test_service_bus_incident_event_sender_closes_the_sender_and_client_when_send_fails() -> None:
    class FailingQueueSender(FakeQueueSender):
        def send_messages(self, messages: list[ServiceBusMessage]) -> None:
            raise RuntimeError("simulated Service Bus send failure")

    queue_sender = FailingQueueSender()
    client = FakeServiceBusClient(queue_sender)
    sender = ServiceBusIncidentEventSender(
        fully_qualified_namespace="sb-namespace.servicebus.windows.net",
        queue_name="order-events",
        credential=FakeCredential(),
        client_factory=lambda *_args: client,
    )

    try:
        sender.send_events([{"schemaVersion": "v2", "id": "incident-order-001"}])
    except RuntimeError:
        pass
    else:
        raise AssertionError("expected the simulated send failure to propagate")

    assert client.closed is True
    assert queue_sender.closed is True
