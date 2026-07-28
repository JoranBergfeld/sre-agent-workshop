# Design — App Service Scenario: Red Button 500 (`red-button-500`)

The **gentle intro** scenario for the **`appservice`** track. A deliberately minimalistic page ships
two buttons — a **green** one and a **red** one. The green button calls `/api/green` and always returns
`200`; the red button calls `/api/red`, a **broken feature** that returns `HTTP 500`. `/health` stays
green throughout. A short burst of red-button traffic trips a 5xx alert, and the SRE Agent detects the
failing endpoint, explains it from telemetry, and drives remediation in two layers: an **operational
kill-switch** (an app setting) and a **durable `@copilot` PR** that removes the broken code path.

This is the simplest possible end-to-end demonstration of the SRE Agent loop — authorable and demoable
inside an hour, reusing the existing `appservice` substrate (no new track, no new infrastructure, no new
workflow).

## Problem & Goal

The workshop's existing scenarios (`cosmos-rbac-removal`, `workload-identity-break`, `canary-bad-release`,
the VM set) are all **intermediate/advanced** — dependency RBAC, federated identity, canary slots, host
exhaustion. There is no *dead-simple* "click a button, get a 500, watch the agent notice" scenario for a
first-five-minutes demo or a time-boxed session.

**Goal:** author a self-contained scenario, `scenarios/cloud-agent-handover/scenarios/red-button-500/`, whose fault
is a single broken endpoint behind a red button, is detected by an App Insights `AppRequests` 5xx alert,
validated by a health probe, and remediated both operationally (a feature kill-switch) and durably (a
Code-visible `@copilot` PR). Wire it into the framework (generated aggregator, INDEX, README table) using
the substrate's existing alert seam. Add a tiny, self-contained two-button page + two endpoints to the
existing shop app **without disturbing** the shop landing (`/`) or the `canary-bad-release` scenario.

**Non-goal (tracked separately):** the broader documentation pass that reconciles every track's module
docs with the real scenario set. That is a follow-on effort; this spec covers only the new scenario and
the scenario-scoped README.

## Why this scenario (vs the existing ones)

| Track / scenario | Fault | Signal | Remediation | Level |
|---|---|---|---|---|
| `aks` `cosmos-rbac-removal` | CosmosDB RBAC deleted | total 500s on `/items` | GitOps Bicep PR re-adds role | intermediate |
| `appservice` `canary-bad-release` | bad release on a canary slot | intermittent 5xx on `/products` | traffic rollback + `@copilot` revert PR | intermediate |
| `vm` (cpu/disk/iis/size) | host-level exhaustion / retirement | metric / perf / ARG | approval-gated remediation | intermediate+ |
| **`appservice` `red-button-500`** | **one broken endpoint behind a red button** | **direct 5xx on `/api/red`** | **kill-switch app setting + `@copilot` code-fix PR** | **beginner** |

The novelty is **simplicity**: a deterministic, self-evident fault (`red → 500`) with the smallest
possible surface, so the teaching focus is the *agent loop itself* rather than the intricacies of the
fault. It is the on-ramp before the intermediate scenarios.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Host track | **`appservice`** (reuse existing app + infra + alert + deploy workflow) | Fastest end-to-end (<1 h); no cluster provisioning; App Insights alerting already wired. A new ACA/SWA track was rejected as too large; a pure static web app was rejected because static content emits **no** Azure Monitor signal (App Insights on Static Web Apps requires an API). |
| App surface | A **dedicated** `/demo` page + `/api/green` + `/api/red`, added to `src/Program.cs` | Self-contained; leaves the shop `/`, `/products`, and the `canary-bad-release` scenario untouched. |
| The fault | `/api/red` returns **HTTP 500** (logs an error → App Insights) | The simplest, most self-evident fault; deterministic, not probabilistic. |
| Fault control | App setting **`RED_BUTTON_MODE`**, read per request; **default (unset) = `broken`** | Gives an operational **kill-switch** for the fast-mitigation layer, and makes red 500 **out of the box** (instant demo). `= "ok"` (or the durable code fix) makes `/api/red` return 200. |
| Green button | `/api/green` → always `200` | The healthy control the learner contrasts against; proves the app/plan/telemetry are fine and only the red feature is broken. |
| Detection | **App Insights `AppRequests` 5xx** on `/api/red`, alert scoped to the Log Analytics workspace | The app is auto-instrumented (`AddApplicationInsightsTelemetry`), so a 500 on `/api/red` lands in `AppRequests` with no extra wiring. Mirrors `canary-5xx`. |
| Inject | Set `RED_BUTTON_MODE=broken` (re-arm) + a short `curl` burst on `/api/red` | Slot-free and build-free — simpler than canary's zip-deploy inject. "Simulate users clicking the broken button" to exceed the alert threshold. |
| Operational remediation | `az webapp config appsettings set RED_BUTTON_MODE=ok` (action `disable-red-button`) | Immediate mitigation with no redeploy — the manual/facilitator fallback, mirroring AKS/canary running `az` directly. |
| Durable remediation | **`@copilot` PR** that removes the broken branch in `/api/red` so it returns `200` unconditionally | The signature GitOps fix the SRE Agent drives; makes the fault non-recurring in code, not just masked by config. |

### Two-layer remediation (mirrors `canary-bad-release`)

The canary scenario establishes the pattern **operational mitigation now, durable code fix via PR**. This
scenario reuses it exactly:

- **Operational (fast):** flip the `RED_BUTTON_MODE` kill-switch to `ok` → `/api/red` returns 200
  immediately. Reversible; also the re-arm lever for re-running the scenario.
- **Durable (correct):** the SRE Agent files a GitHub issue; `@copilot` opens a PR that deletes the broken
  code path in `/api/red` (returns 200 regardless of the setting); merging it and re-running **Deploy App
  Service Application** ships the corrected build.

### Code-visibility constraint

The SRE Agent sees only what is committed to GitHub via its **Code** integration. Therefore the broken
`/api/red` handler, the two-button page, the manifest, the alert, and the docs are **all committed** before
a run. The `inject` step does not mutate git — it re-arms an app setting and generates traffic against an
already-committed endpoint. The Agent identifies the cause from the committed handler plus `AppRequests`
telemetry and drives the fix as a real `@copilot` PR.

## Defaults & naming

Resolved from the substrate (`workloadName` default **`srelabapp`**, resource group `rg-srelabapp`):

| Thing | Value |
|---|---|
| Resource group | `rg-srelabapp` (script flag `-g`) |
| Workload | `srelabapp` (script flag `-w`) |
| Web app | `srelabapp-web-{suffix}` (resolved by name prefix `${WORKLOAD}-web-`) |
| Log Analytics | `srelabapp-law` (alert scope) |
| App Insights | `srelabapp-ai` |
| Alert resource | `srelabapp-redbutton-5xx` (`${workloadName}-${alertName}`) |
| Fault control setting | `RED_BUTTON_MODE` (unset ⇒ `broken`; `ok` ⇒ healthy) |
| Page route | `GET /demo` |
| Green endpoint | `GET /api/green` → 200 |
| Red endpoint | `GET /api/red` → 500 (armed) / 200 (killed or fixed) |

## Application changes — `scenarios/cloud-agent-handover/src/Program.cs`

Add three route handlers (after the existing `/health`, before `app.Run()`), plus a per-request read of the
fault-control setting. No changes to `/`, `/products`, or the SQL/identity wiring.

```csharp
// ── Red Button demo (red-button-500 scenario) ─────────────────────────────
// A deliberately minimal two-button page. The green button always works; the red
// button ships a broken feature that returns HTTP 500. RED_BUTTON_MODE is an
// operational kill-switch (unset ⇒ broken). The durable fix removes the broken branch.
app.MapGet("/demo", () => Results.Content(RedButtonPage, "text/html"));

app.MapGet("/api/green", () => Results.Json(new { status = "ok", button = "green" }));

app.MapGet("/api/red", (ILogger<Program> logger) =>
{
    var mode = Environment.GetEnvironmentVariable("RED_BUTTON_MODE") ?? "broken";
    if (mode == "broken")
    {
        logger.LogError("Red button pressed — /api/red is broken, returning HTTP 500");
        return Results.Json(new { error = "The red button is broken" }, statusCode: 500);
    }
    return Results.Json(new { status = "ok", button = "red" });
});
```

`RedButtonPage` is a `const string` holding a minimal self-contained HTML document: a heading, a green
button and a red button, and a small result line. Each button issues `fetch()` to its endpoint and prints
the returned HTTP status, so a facilitator can click **red** and *see* the 500 live. (App Insights records
every `/api/red` request via the existing auto-instrumentation; the `LogError` also surfaces in
`AppTraces`/`AppExceptions` for the agent's root-cause step.)

## Alert — `alert.bicep`

A `Microsoft.Insights/scheduledQueryRules` named `${workloadName}-redbutton-5xx`, scoped to the Log
Analytics workspace (`scopeResourceId`), declaring exactly the four framework params
(`location`, `workloadName`, `tags`, `scopeResourceId`) and binding `scopes: [scopeResourceId]` — mirroring
`canary-bad-release/alert.bicep`. Criteria:

```kusto
AppRequests
| where TimeGenerated > ago(10m)
| where Url contains "/api/red"
| where Success == false or toint(ResultCode) >= 500
| summarize Failures = count()
```

`timeAggregation: Total`, `metricMeasureColumn: Failures`, `operator: GreaterThan`, `threshold: 3`,
`evaluationFrequency: PT5M`, `windowSize: PT5M`, `severity: 2`, `autoMitigate: true`. Wired into the track
by the generated `modules/scenario-alerts.bicep` (the `main.bicep` `scenarioAlerts` seam already passes
`logAnalyticsResourceId`).

## Investigation — `query.kql`

Primary query returns the failing `/api/red` requests (count + result codes) over the last 30 minutes; a
commented follow-up drills `AppExceptions`/`AppTraces` for the "red button is broken" message — matching the
canary `query.kql` shape.

```kusto
// Investigation for the red-button-500 scenario.
// 1) Failing /api/red requests over the last 30 minutes.
AppRequests
| where TimeGenerated > ago(30m)
| where Url contains "/api/red"
| summarize total = count(), failures = countif(Success == false or toint(ResultCode) >= 500)
    by bin(TimeGenerated, 5m)
| order by TimeGenerated desc

// 2) Root cause — the broken handler logs an error on every red-button press.
// AppTraces
// | where TimeGenerated > ago(30m)
// | where Message contains "/api/red is broken"
// | project TimeGenerated, Message, SeverityLevel
```

## Scenario scripts (both shells; `.sh` executable)

All scripts accept `-g|--resource-group` (default `rg-srelabapp`) and `-w|--workload` (default `srelabapp`),
resolve the web app by the `${WORKLOAD}-web-` name prefix, and `set -euo pipefail` (bash) — mirroring canary.

- **`inject.sh` / `inject.ps1`** — re-arm the fault (`az webapp config appsettings set … RED_BUTTON_MODE=broken`),
  wait briefly for the app-settings restart to settle, resolve the host, then issue a burst of
  `curl` GETs on `/api/red` (default `-n 20`) to exceed the alert threshold. Prints a confirmation.
- **`validate.sh` / `validate.ps1`** — issue `-n` (default 12) cookie-less `GET /api/red`; **any** non-200
  ⇒ degraded (exit 1), all 200 ⇒ healthy (exit 0). Identical shape to canary's validate, retargeted to
  `/api/red`.
- **`remediate.sh` / `remediate.ps1`** (action `disable-red-button`) — `az webapp config appsettings set …
  RED_BUTTON_MODE=ok`; prints that `/api/red` now returns 200. Idempotent; also the re-arm's inverse.

## Manifest — `scenario.yaml`

```yaml
id: red-button-500
title: Red Button 500
track: appservice
summary: A minimalistic two-button page ships a broken "red" feature — clicking red calls /api/red, which returns HTTP 500, while the green button (/api/green) and /health stay 200. A burst of red-button traffic trips a 5xx alert and the SRE Agent diagnoses the failing endpoint and drives the fix.
severity: 2
estimatedMinutes: 15
difficulty: beginner
learningObjectives:
  - See the full SRE Agent loop (alert → investigate → remediate) in its simplest form.
  - Distinguish a healthy liveness probe (/health 200) from a failing feature endpoint (/api/red 500).
  - Drive remediation in two layers — an operational feature kill-switch, then a durable GitHub issue / @copilot PR (GitOps).
signal:
  alertModule: alert.bicep
  alertName: redbutton-5xx
inject:
  bash: inject.sh
  powershell: inject.ps1
validate:
  bash: validate.sh
  powershell: validate.ps1
remediate:
  - action: disable-red-button
    bash: remediate.sh
    powershell: remediate.ps1
    description: Operational kill-switch — set the RED_BUTTON_MODE app setting to "ok" so /api/red returns 200 immediately. The durable fix is a @copilot PR that removes the broken code path.
investigation:
  query: query.kql
docPage: README.md
```

## Attendee README — `README.md`

Mirrors the canary README structure: **What breaks** (red button → 500; green + `/health` stay green) ·
**Prerequisites** (App Service track deployed; local `az`, `curl`) · **Inject the fault** · **Validate impact**
· **Let the SRE Agent remediate** (detect → investigate with `query.kql` → operational kill-switch → durable
`@copilot` code-fix PR) · **Manual remediation (facilitator fallback)** · **Cleanup / re-arm** (set
`RED_BUTTON_MODE=broken` again, or redeploy the app, to reset for another run).

## Generated artifacts (do not hand-edit)

Produced/updated by `scripts/validate-scenarios.sh --write`:

- `scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep` — now also wires this scenario's
  `alert.bicep`, passing `logAnalyticsResourceId`.
- `scenarios/cloud-agent-handover/scenarios/INDEX.md` — adds the `Red Button 500` row.
- `scenarios/cloud-agent-handover/README.md` — scenario table between the `<!-- BEGIN SCENARIOS -->` / `<!-- END
  SCENARIOS -->` markers gains the row.

## Reused, unchanged infrastructure & tooling

No edits required to: `paths.js` (the `appservice` track already exists → `logAnalyticsResourceId`), the
schema (`appservice` already in the `track` enum), `main.bicep` (the `scenarioAlerts` seam is live),
`monitoring.bicep`/`appservice.bicep` (App Insights + Log Analytics already wired; the app is
auto-instrumented), and `.github/workflows/deploy-appservice-app.yml` (already builds and deploys
`scenarios/cloud-agent-handover/src/**` on push and on manual dispatch).

## Testing / validation plan

1. `scripts/validate-scenarios.sh --write` then `scripts/validate-scenarios.sh` prints
   **`Scenario validation passed`** (no drift).
2. `cd scripts/scenario-tools && npm test` passes (Node `--test`).
3. `az bicep build` on the new `alert.bicep` and the regenerated aggregator (as CI's
   `validate-scenarios.yml` does).
4. `dotnet build scenarios/cloud-agent-handover/src/Shop.csproj` compiles with the added handlers.
5. `chmod +x` on the three new `.sh` scripts; confirm both shells exist for `inject`/`validate`/`remediate`.
6. Manual dry logic check: unset ⇒ `/api/red` 500; `RED_BUTTON_MODE=ok` ⇒ 200; `/api/green` always 200.

## Out of scope

- The full documentation pass across all tracks (reconcile module docs with the real scenario set,
  including this scenario, and fix the "2 described / 3 real" drift). Follow-on effort, separate spec/plan.
- Any change to the shop landing page, `/products`, SQL, deployment slots, or the `canary-bad-release`
  scenario.
- New tracks (ACA, Static Web Apps) — explicitly rejected for the 1-hour constraint.
