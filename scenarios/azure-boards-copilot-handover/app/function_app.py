import json
import os
from datetime import UTC, datetime

import azure.functions as func
from azure.data.tables import TableServiceClient
from azure.identity import DefaultAzureCredential

from order_events.adapters.service_bus import RetrySettings, process_order_event_message
from order_events.adapters.storage import ReceiptTableStore, ScenarioStateTableStore
from order_events.workshop import get_workshop_status, submit_incident_batch

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
    return ReceiptTableStore(table_client)


def _scenario_state_store() -> ScenarioStateTableStore:
    table_client = _table_service_client().get_table_client(os.environ["SCENARIO_STATE_TABLE_NAME"])
    return ScenarioStateTableStore(table_client)


def _retry_settings() -> RetrySettings:
    return RetrySettings(
        delay_seconds=float(os.environ.get("UNSUPPORTED_EVENT_RETRY_DELAY_SECONDS", "5")),
        max_delay_seconds=float(os.environ.get("UNSUPPORTED_EVENT_RETRY_MAX_DELAY_SECONDS", "30")),
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
    status = get_workshop_status(_scenario_state_store())
    return _json_response(
        {
            "incidentBatchId": status.incident_batch_id,
            "incidentBatchInjected": status.incident_batch_injected,
        },
        status_code=200,
    )


@app.function_name(name="SubmitV2Orders")
@app.route(route="submit-v2-orders", methods=["POST"], auth_level=func.AuthLevel.FUNCTION)
@app.service_bus_queue_output(
    arg_name="order_events_out",
    connection="ServiceBusConnection",
    queue_name="%ORDER_EVENTS_QUEUE_NAME%",
)
def submit_v2_orders(
    req: func.HttpRequest, order_events_out: func.Out[list[str]]
) -> func.HttpResponse:
    submission = submit_incident_batch(_scenario_state_store(), claimed_at=_clock())
    if submission.events:
        order_events_out.set([json.dumps(event) for event in submission.events])

    return _json_response(
        {
            "incidentBatchAlreadyInjected": submission.already_injected,
            "eventsEnqueued": len(submission.events),
        },
        status_code=200 if submission.already_injected else 202,
    )
