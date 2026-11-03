"""Paste this complete module into a Python tool; configure identity separately."""

import json
import math
import re
import time
from datetime import datetime, timedelta, timezone


def main(workspace_id: str, insights_resource_id: str, app_name: str,
         start_utc: str, end_utc: str, sample_limit: int = 3) -> dict:
    """Read bounded synthetic order/health telemetry. No query or URL input."""
    guid = r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"
    resource = (
        rf"/subscriptions/{guid}/resourceGroups/alctx-[a-z0-9-]{{1,60}}"
        r"/providers/Microsoft\.Insights/components/(alctx-[a-z0-9-]{1,54})-insights"
    )
    try:
        if not isinstance(workspace_id, str) or not re.fullmatch(guid, workspace_id):
            raise ValueError("workspace_id must be the setup workspace GUID")
        match = re.fullmatch(resource, insights_resource_id) if isinstance(insights_resource_id, str) else None
        if not match or match[1] != app_name:
            raise ValueError("use matching capsule Insights resource ID and app name")
        if type(sample_limit) is not int or not 1 <= sample_limit <= 10:
            raise ValueError("sample_limit must be an integer from 1 to 10")
        for value in (start_utc, end_utc):
            if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", value):
                raise ValueError("times must be UTC YYYY-MM-DDTHH:MM:SSZ")
        start = datetime.strptime(start_utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        end = datetime.strptime(end_utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if not now - timedelta(hours=24) <= start < end <= now:
            raise ValueError("use a completed window within the last 24 hours")
        if end - start > timedelta(minutes=15):
            raise ValueError("window must not exceed 15 minutes")
    except ValueError as error:
        return {"status": "invalid_input", "reason": str(error)}
    query = f"""
let requests = materialize(
    AppRequests
    | where TimeGenerated >= datetime({start_utc}) and TimeGenerated < datetime({end_utc})
    | where _ResourceId =~ '{insights_resource_id}' and AppRoleName == '{app_name}'
    | where Name in ('GET /api/orders/DEMO-1001', 'GET /health')
    | project TimeGenerated, Route=Name, OperationId, DurationMs, ResultCode, Success,
              Revision=tostring(Properties.revision)
);
let samples = materialize(requests | order by TimeGenerated desc | take {sample_limit});
let summary = requests
    | summarize Requests=count(), Errors=countif(Success == false or toint(ResultCode) >= 400),
                AverageMs=round(avg(DurationMs), 2), P95Ms=round(percentile(DurationMs, 95), 2) by Route
    | extend Kind='summary';
let stages = AppTraces
    | where TimeGenerated >= datetime({start_utc}) and TimeGenerated < datetime({end_utc})
    | where _ResourceId =~ '{insights_resource_id}' and AppRoleName == '{app_name}'
    | where OperationId in (samples | project OperationId) and Message == 'stage.completed'
    | where tostring(Properties.route) in ('/api/orders/DEMO-1001', '/health')
    | order by TimeGenerated desc | take {sample_limit}
    | project Kind='stage', Route=strcat('GET ', tostring(Properties.route)),
              TimeGenerated, OperationId, DurationMs=todouble(Properties.duration_ms),
              Revision=tostring(Properties.revision), Stage=tostring(Properties.stage);
union summary, (samples | extend Kind='request' | project-away Success), stages
| project Kind, Route, Requests, Errors, AverageMs, P95Ms, TimeGenerated,
          OperationId, DurationMs, ResultCode, Revision, Stage
| take {2 + 2 * sample_limit}
"""
    try:
        from azure.identity import DefaultAzureCredential
        token = DefaultAzureCredential(exclude_interactive_browser_credential=True).get_token(
            "https://api.loganalytics.io/.default"
        ).token
    except Exception:
        return {"status": "unavailable", "reason": "log_analytics_identity_unavailable"}
    try:
        import requests
        deadline = time.monotonic() + 30
        with requests.post(
            f"https://api.loganalytics.azure.com/v1/workspaces/{workspace_id}/query",
            headers={"Authorization": f"Bearer {token}", "Prefer": "wait=20",
                     "Content-Type": "application/json"},
            json={"query": query, "timespan": f"{start_utc}/{end_utc}"},
            timeout=(5, 25), stream=True, allow_redirects=False,
        ) as response:
            if response.status_code != 200:
                return {"status": "unavailable", "reason": "query_http_error",
                        "http_status": response.status_code}
            data = bytearray()
            for chunk in response.iter_content(chunk_size=4096):
                data.extend(chunk)
                if len(data) > 65536 or time.monotonic() > deadline:
                    return {"status": "unavailable", "reason": "query_response_bound_exceeded"}
        payload = json.loads(data)
        if "error" in payload:
            return {"status": "unavailable", "reason": "query_partial_or_error"}
        if len(payload["tables"]) != 1:
            raise ValueError("unexpected tables")
        table = payload["tables"][0]
        if table["name"] != "PrimaryResult":
            raise ValueError("unexpected result")
        expected = ["Kind", "Route", "Requests", "Errors", "AverageMs", "P95Ms",
                    "TimeGenerated", "OperationId", "DurationMs", "ResultCode", "Revision", "Stage"]
        names = [column["name"] for column in table["columns"]]
        if names != expected or len(table["rows"]) > 2 + 2 * sample_limit:
            raise ValueError("unexpected schema or row count")
        counts = {"summary": 0, "request": 0, "stage": 0}
        summary_routes = set()
        for row in table["rows"]:
            if len(row) != len(expected):
                raise ValueError("unexpected row")
            for name, value in zip(names, row):
                if name in ("Requests", "Errors", "AverageMs", "P95Ms", "DurationMs"):
                    if value is not None and (
                        type(value) not in (int, float) or not math.isfinite(value) or value < 0
                    ):
                        raise ValueError("unexpected numeric value")
                elif value is not None and (not isinstance(value, str) or len(value) > 128):
                    raise ValueError("unexpected text value")
            if row[0] not in counts or row[1] not in ("GET /health", "GET /api/orders/DEMO-1001"):
                raise ValueError("unexpected kind or route")
            counts[row[0]] += 1
            if row[0] == "summary":
                if type(row[2]) is not int or type(row[3]) is not int or not 0 <= row[3] <= row[2]:
                    raise ValueError("invalid request/error counts")
                if row[1] in summary_routes:
                    raise ValueError("duplicate summary")
                summary_routes.add(row[1])
        if counts["request"] > sample_limit or counts["stage"] > sample_limit:
            raise ValueError("excessive samples")
        rows = [dict(zip(names, row)) for row in table["rows"]]
        gaps = []
        if "GET /api/orders/DEMO-1001" not in summary_routes:
            gaps.append("missing_order_summary")
        if "GET /health" not in summary_routes:
            gaps.append("missing_health_summary")
        if not counts["stage"]:
            gaps.append("missing_correlated_stage_sample")
        return {
            "status": "ok" if rows else "no_data",
            "scope": {"workspace_id": workspace_id, "insights_resource_id": insights_resource_id,
                      "app_name": app_name, "start_utc": start_utc, "end_utc": end_utc},
            "bounds": {"max_window_minutes": 15, "samples_per_kind": sample_limit,
                       "max_rows": 2 + 2 * sample_limit, "max_response_bytes": 65536},
            "rows": rows, "evidence_gaps": gaps,
        }
    except Exception:
        return {"status": "unavailable", "reason": "query_transport_or_response"}
