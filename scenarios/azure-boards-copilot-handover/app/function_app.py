import json
import os
from datetime import UTC, datetime
from typing import cast

import azure.functions as func
from azure.data.tables import TableServiceClient
from azure.identity import DefaultAzureCredential

from order_events.adapters.service_bus import (
    RetrySettings,
    ServiceBusIncidentEventSender,
    process_order_event_message,
)
from order_events.adapters.storage import (
    ReceiptTableClient,
    ReceiptTableStore,
    ScenarioStateTableClient,
    ScenarioStateTableStore,
)
from order_events.workshop import get_workshop_status, submit_control_batch, submit_incident_batch

app = func.FunctionApp()

_credential = DefaultAzureCredential()


def _clock() -> datetime:
    return datetime.now(UTC)


def _table_service_client() -> TableServiceClient:
    return TableServiceClient(endpoint=os.environ["TABLE_SERVICE_ENDPOINT"], credential=_credential)


def _receipt_store() -> ReceiptTableStore:
    table_client = _table_service_client().get_table_client(
        os.environ["NORMALIZED_RECEIPTS_TABLE_NAME"]
    )
    # azure.data.tables.TableClient supports the required methods, but its overload-rich
    # type stubs do not structurally satisfy our narrower protocol under mypy strict mode.
    return ReceiptTableStore(cast(ReceiptTableClient, table_client))


def _scenario_state_store() -> ScenarioStateTableStore:
    table_client = _table_service_client().get_table_client(os.environ["SCENARIO_STATE_TABLE_NAME"])
    # azure.data.tables.TableClient supports the required methods, but its overload-rich
    # type stubs do not structurally satisfy our narrower protocol under mypy strict mode.
    return ScenarioStateTableStore(cast(ScenarioStateTableClient, table_client))


def _retry_settings() -> RetrySettings:
    return RetrySettings(
        delay_seconds=float(os.environ.get("UNSUPPORTED_EVENT_RETRY_DELAY_SECONDS", "5")),
        max_delay_seconds=float(os.environ.get("UNSUPPORTED_EVENT_RETRY_MAX_DELAY_SECONDS", "30")),
    )


def _event_sender() -> ServiceBusIncidentEventSender:
    return ServiceBusIncidentEventSender(
        # Matches the ServiceBusConnection__fullyQualifiedNamespace app setting name
        # Azure Functions' Service Bus extension expects for managed-identity auth.
        fully_qualified_namespace=os.environ[
            "ServiceBusConnection__fullyQualifiedNamespace"  # noqa: SIM112
        ],
        queue_name=os.environ["ORDER_EVENTS_QUEUE_NAME"],
        credential=_credential,
    )


def _json_response(body: dict[str, object], *, status_code: int) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(body), status_code=status_code, mimetype="application/json")


@app.function_name(name="ProcessOrderEvent")
@app.service_bus_queue_trigger(
    arg_name="message",
    connection="ServiceBusConnection",
    queue_name="%ORDER_EVENTS_QUEUE_NAME%",
)
def process_order_event(message: func.ServiceBusMessage) -> None:
    process_order_event_message(
        message,
        receipt_store=_receipt_store(),
        retry_settings=_retry_settings(),
    )


@app.function_name(name="WorkshopStatus")
@app.route(route="status", methods=["GET"], auth_level=func.AuthLevel.FUNCTION)
def workshop_status(req: func.HttpRequest) -> func.HttpResponse:
    status = get_workshop_status(
        _scenario_state_store(),
        _receipt_store(),
        deployed_commit_sha=os.environ.get("DEPLOYED_COMMIT_SHA") or None,
        deployed_at_utc=os.environ.get("DEPLOYED_AT_UTC") or None,
    )
    return _json_response(
        {
            "incidentBatchId": status.incident_batch_id,
            "incidentBatchInjected": status.incident_batch_injected,
            "deployedCommitSha": status.deployed_commit_sha,
            "deployedAtUtc": status.deployed_at_utc,
            "normalizedReceiptCount": status.normalized_receipt_count,
            "v1ReceiptCount": status.v1_receipt_count,
            "v2ReceiptCount": status.v2_receipt_count,
        },
        status_code=200,
    )


@app.function_name(name="SubmitV2Orders")
@app.route(route="submit-v2-orders", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def submit_v2_orders(req: func.HttpRequest) -> func.HttpResponse:
    # Sent through the Service Bus SDK directly (order_events.adapters.service_bus):
    # the Python Service Bus queue output binding only supports a single message per
    # invocation, so it cannot carry this 20-event incident batch.
    submission = submit_incident_batch(
        _scenario_state_store(), _event_sender(), claimed_at=_clock()
    )

    return _json_response(
        {
            "incidentBatchAlreadyInjected": submission.already_injected,
            "eventsEnqueued": len(submission.events),
        },
        status_code=200 if submission.already_injected else 202,
    )


@app.function_name(name="SeedV1Controls")
@app.route(route="seed-v1-controls", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
def seed_v1_controls(req: func.HttpRequest) -> func.HttpResponse:
    # Same Service Bus SDK send path as SubmitV2Orders, and the same claim/complete
    # idempotency guarantee: safe to call repeatedly (e.g. from setup.sh retries).
    submission = submit_control_batch(_scenario_state_store(), _event_sender(), claimed_at=_clock())

    return _json_response(
        {
            "controlBatchAlreadyInjected": submission.already_injected,
            "eventsEnqueued": len(submission.events),
        },
        status_code=200 if submission.already_injected else 202,
    )
