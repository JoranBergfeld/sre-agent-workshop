# Order-status service: architecture and operations

This short reference describes the deployed system, not an investigation
procedure or repair answer. No external order system, database, customer data
or downstream dependency is involved.

## Request path

HTTPS → App Service Linux Basic plan → Nginx (8080) → PHP-FPM →
the synthetic order-status application. The worker pool permits independent
requests; this is not the single-worker PHP development server.

- `GET /api/orders/DEMO-1001` returns synthetic order status. A request-path
  stage performs a small intentional pause in the baseline.
- `GET /health` reports application health independently of the order path.
- Other routes return a not-found response. Only synthetic identifiers are used.

One operator action deploys a prepared revision. The incident is elevated
latency with valid content, not a promised HTTP error. Controlled observation
uses one order request plus three healthy requests; no load amplification.

## Connected evidence

Application events carry UTC time, `request_id`, route, revision and package
preparation time. Completed request/stage events include `duration_ms`.
Azure Application Insights receives request duration and correlated trace
events via HTTPS ingestion after response completion; telemetry export failures
are logged, not silently reported as successful investigation evidence.

In the connected Log Analytics workspace, inspect `AppRequests` and
`AppTraces`. `OperationId` matches the response's `X-Request-ID`; custom
properties retain revision, route and stage evidence. `AppRoleName` is the
App Service name. App Service diagnostic settings also collect console, HTTP
and platform logs. The fast route provides bounded unrelated healthy evidence.

Compare package `prepared_at`, local `deployedAt`, deployment command result,
Azure deployment history and Activity Log timing. Preparation is not deployment
completion. Query a narrow resource/time window; ingestion is asynchronous,
and workspace caps/egress/permissions may produce missing evidence.

## Operational boundaries

Only the learner runs deployment helpers. SRE investigates and proposes an
approved issue handover, never runtime mutation. Reviewed code deployment
requires explicit learner action and independent runtime observation afterward.
Injection/reset deploy known revisions without changing tracked source;
coding tasks need a separately published faulty branch. Reset is not repair.

The dedicated `alctx-*` group contains only tagged scenario resources.
Ownership state and local evidence remain outside Azure deletion. Shared
agents/connectors and GitHub artifacts are not part of automated cleanup.
