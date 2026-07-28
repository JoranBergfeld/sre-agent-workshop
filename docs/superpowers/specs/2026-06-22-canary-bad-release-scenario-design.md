# Design — App Service Scenario: Canary Release Regression (`canary-bad-release`)

The first break scenario for the **`appservice`** track. A "v2" shop release with a SQL
schema-mismatch bug is rolled out to a **staging deployment slot** and given **50% canary traffic**,
so roughly half of `/products` calls return `500` while `/health` stays green and the production slot
is unaffected. The v2 build also **reskins the shop green→red** and badges itself `v2 · canary`, so
anyone refreshing the live site can *see* which slot they landed on while only `/products` actually
fails. The SRE Agent detects the partial outage, correlates it to the canary slot, rolls the
canary back operationally, and drives the durable fix through a GitHub issue → `@copilot` PR (GitOps).

This is the "first break scenario" cycle that the
[App Service Track Substrate](2026-06-20-appservice-track-substrate-design.md) deliberately deferred.

## Problem & Goal

The `appservice` track substrate ships a working, observable .NET 10 shop on Azure App Service (Linux)
backed by Azure SQL — but **zero scenarios**. We want the first fault, and it should exercise the
feature that makes App Service distinct from the AKS and VM tracks: **deployment slots**.

**Goal:** author a self-contained scenario, `workshops/appservice/scenarios/canary-bad-release/`, that
injects a *partial* outage via a bad canary release, is detected by an App Insights alert, validated by
a health probe, and remediated both operationally (traffic rollback) and durably (a Code-visible
`@copilot` PR). Wire it into the framework (generated aggregator, INDEX, README table) and the
substrate's alert seam.

## Why this scenario (vs the existing tracks)

| Track | Fault | Signal | Remediation |
|---|---|---|---|
| `aks` `cosmos-rbac-removal` | CosmosDB RBAC deleted | total 500s on `/items` | GitOps Bicep PR re-adds role assignment |
| `vm` (cpu/disk/iis) | host-level resource exhaustion | metric/perf alerts | approval-gated remediation |
| **`appservice` `canary-bad-release`** | **bad release on a canary slot** | **intermittent 5xx on `/products`** | **operational traffic rollback + `@copilot` revert PR** |

The novelty is the **partial / intermittent** signal (a naive uptime check misses it) and the
**deployment-slot** mechanic — a genuinely different fault surface and a richer detection story
(correlate failing requests to a slot taking canary traffic).

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| A/B mechanism | **Deployment slots / canary** (`staging` slot + traffic routing) | THE idiomatic App Service feature; distinct from AKS/VM. |
| Fault | **A real code regression** deployed to the canary slot | Most realistic "bad release"; authentic bug, not a simulated chaos flag. |
| The bug | `/products` query references a non-existent `Sku` column → `SqlException: Invalid column name 'Sku'` → caught → `500` | One-line, plausible "code shipped ahead of the DB migration"; diagnosable from the exception text. `/health` (no DB call) stays green. |
| Visible A/B marker | The **v2** build reskins `/` green→**red**, badges itself `v2 · canary`, and flips the **Add to cart** button red | A *didactic* marker so learners can see which slot served them; cosmetic, rides along with the `Sku` regression as a believable "v2 release". |
| Traffic | **Canary split** — `az webapp traffic-routing set --distribution staging=50` | ~50% of `/products` fail → intermittent 5xx, the truest "A/B test catches a bad variant" signal. |
| Bad-build delivery | **Self-contained overlay** — a committed `Program.regression.cs`; `inject` builds it locally and zip-deploys to the slot | Self-contained scenario; synchronous local scripts consistent with AKS/VM; no git mutation at inject time. |
| Detection | **App Insights `AppRequests` 5xx** on `/products`, alert scoped to the Log Analytics workspace | Both slots are configured with the **same** App Insights connection string (set explicitly on the slot), so the canary's telemetry lands in the same App Insights / Log Analytics workspace — no slot-level diagnostic wiring is needed. |
| Operational remediation | `az webapp traffic-routing clear` (+ redeploy the good build to the slot) | Immediate mitigation; the manual-fallback mechanism, mirroring AKS `remediate.sh` running `az` directly. |
| Durable remediation | **`@copilot` PR** that **reverts** the `Sku` query (canonical) or forward-fixes `db/schema.sql` | Code-visible GitOps fix the SRE Agent can drive; the revert is the safe default for a bad release. |

### Code-visibility constraint

The SRE Agent only sees what is in GitHub through its **Code** integration. Therefore **every
artifact is committed and pushed** before a workshop run: the scenario manifest, the
`Program.regression.cs` "v2 release" source, the alert, and the docs. The Agent identifies the *cause*
from the committed regression asset plus telemetry, and drives the *fix* as a real `@copilot` PR. The
`inject` step does not mutate git (it deploys an already-committed artifact operationally).

## Defaults & naming

Resolved from the substrate (`workloadName` default **`srelabapp`**, resource group `rg-srelabapp`):

| Thing | Value |
|---|---|
| Resource group | `rg-srelabapp` (script flag `-g`) |
| Workload | `srelabapp` (script flag `-w`) |
| Web app | `srelabapp-web-{suffix}` (resolved by name prefix) |
| Canary slot | `staging` |
| Log Analytics | `srelabapp-law` |
| App Insights | `srelabapp-ai` |
| Alert resource | `srelabapp-canary-5xx` (`${workloadName}-${alertName}`) |

## Infrastructure changes

### `workshops/appservice/infra/bicep/modules/appservice.bicep`

1. **Plan tier:** bump the App Service Plan SKU `B1`/`Basic` → **`S1`/`Standard`** (deployment slots
   require Standard or higher).
2. **Staging slot:** add a `Microsoft.Web/sites/slots@2023-12-01` resource named `staging`, child of
   the web app, with the same `identity` (UAMI), `linuxFxVersion: 'DOTNETCORE|10.0'`, `alwaysOn: true`,
   `healthCheckPath: '/health'`, `httpsOnly: true`, **and the same `appSettings` set explicitly**.
   A Bicep-declared slot does **not** auto-inherit the production app's settings, so the slot must
   carry the same `APPLICATIONINSIGHTS_CONNECTION_STRING`, `AZURE_SQL_CONNECTIONSTRING`, and
   `SCM_DO_BUILD_DURING_DEPLOYMENT` values. Refactor the production `appSettings` into a shared Bicep
   `var` and apply it to **both** the site and the slot, so the slot is a faithful clone and the
   **only** difference at inject time is the deployed build. (Without this, the canary would `500` for
   the wrong reason — a missing `AZURE_SQL_CONNECTIONSTRING` — instead of the `Sku` regression.)
3. **Outputs:** optionally expose the slot's host name; not required by the scripts (they resolve via
   `az`).

### `workshops/appservice/infra/bicep/main.bicep` (alert seam — hand-wired once)

The substrate left a commented seam (lines 88–102). Now that the first scenario exists, **uncomment**
the `scenarioAlerts` module call, passing the track's scope:

```bicep
module scenarioAlerts 'modules/scenario-alerts.bicep' = {
  name: 'scenario-alerts'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    logAnalyticsResourceId: monitoring.outputs.logAnalyticsId
  }
}
```

`modules/scenario-alerts.bicep` itself is **generated** (see "Generated artifacts"); only this call site
is authored by hand, matching the AKS pattern.

### `.github/workflows/deploy-appservice-app.yml` (seed the slot)

After the production zip deploy, also deploy the **good** build to the `staging` slot
(`az webapp deploy --slot staging …`). This keeps the pre-inject baseline slot healthy and gives
remediation a clean build to redeploy. (The `sqlcmd` schema/grant steps are unchanged.)

## Visible A/B marker (the `/` landing page)

So a learner can *see* which release served them, the `/` landing page is themed per build and the v2
build is unmistakably **red**. This is a **didactic** device — real releases don't self-color — but it
makes the canary obvious in a browser and pairs with the functional fault.

`src/Program.cs` (the committed **v1 / good** build) gains a server-rendered shop landing page:

- A `/` handler that runs the products query — factored into a single shared `ProductsQuery` used by
  **both** `/` and `/products` — and renders the catalog rows, a status line, a `v1 · stable` badge,
  and a green **Add to cart** button.
- The query runs inside a `try/catch`. On success it shows "Azure SQL: connected" (green) and the
  rows; on failure it renders a **red error block** with the caught exception message — but the route
  **still returns `200`**. `/` therefore never emits 5xx and never trips the alert; only `/products`
  does. `/health` stays DB-free and green.

`Program.regression.cs` (the **v2 / bad** build) is the same page reskinned **red** with a
`v2 · canary` badge and a red button. Because it carries the `Sku` regression, its `/` renders the red
error block (the real `Invalid column name 'Sku'` message) while still returning `200`, and its
`/products` returns `500`. During the 50% canary, refreshing the site flips between the **green v1**
shop and the **red v2** shop — the red one visibly broken — while `/health` stays green throughout.

## The fault artifact — `Program.regression.cs`

A committed copy of `workshops/appservice/src/Program.cs` representing the **v2 release**, differing in
**two intentional ways**: a cosmetic *reskin* (the visible A/B marker) and one *functional* regression.

```diff
  // visible A/B marker — v2 reskin (cosmetic)
- var accent = "#1a7f37"; var badge = "v1 · stable";  // green
+ var accent = "#d32f2f"; var badge = "v2 · canary";  // red

  // functional regression — the shared products query
- const string ProductsQuery = "SELECT Id, Name, Price FROM dbo.Products ORDER BY Id";
+ const string ProductsQuery = "SELECT Id, Name, Price, Sku FROM dbo.Products ORDER BY Id";
```

`Sku` does not exist in the `Products` schema, so SQL raises `Invalid column name 'Sku'` before any
rows are read. `/products` (JSON) lets this surface as a `500`; the `/` landing page catches it and
renders the red error block but still returns `200` (see *Visible A/B marker*). The reader still maps
`Id`/`Name`/`Price` by ordinal, so no other change is needed. The file compiles cleanly
(`dotnet build` succeeds); the failure is purely at runtime — a genuine, reviewable "v2 release" bug.
The reskin is cosmetic and is **not** the fault; the durable fix targets the query (below).

> Anti-drift note: `Program.regression.cs` mirrors `src/Program.cs` line-for-line except the two diffs
> above (the `accent`/`badge` reskin and the `Sku` query), which the scenario README documents as the
> intended "v2" changes. (A `sed`-derived overlay was rejected: the regression should be a committed,
> reviewable "v2 release" the SRE Agent can see in Code.)

## Inject — `inject.sh` / `inject.ps1`

Synchronous; assumes the substrate infra is deployed (slot present). Defaults `rg-srelabapp` /
`srelabapp`, overridable with `-g`/`-w`.

1. Resolve the web app:
   `WEB=$(az webapp list -g "$RG" --query "[?starts_with(name,'${WORKLOAD}-web-')].name | [0]" -o tsv)`.
2. Build the bad release: copy `workshops/appservice/src` to a temp dir, overwrite `Program.cs` with
   `Program.regression.cs`, `dotnet publish -c Release -o <pub>`, then `zip` the publish output.
3. Deploy to the slot:
   `az webapp deploy -g "$RG" --name "$WEB" --slot staging --type zip --src-path <zip>`.
4. Canary split:
   `az webapp traffic-routing set -g "$RG" --name "$WEB" --distribution staging=50`.
5. Echo the injected state (50% canary to the staging slot running the bad release).

**Prerequisites:** `az`, the **.NET 10 SDK** (`dotnet`), and `zip`. The .NET SDK is a new inject
prerequisite versus the AKS/VM tracks, justified by the .NET-based track. `inject.ps1` mirrors the
steps with PowerShell equivalents.

## Detection — `alert.bicep` + `query.kql`

### `alert.bicep`

Declares exactly `location`, `workloadName`, `tags`, `scopeResourceId` and binds
`scopes: [scopeResourceId]` (per the framework convention). The generated aggregator passes the
track's `logAnalyticsResourceId` as `scopeResourceId`.

- Resource: `Microsoft.Insights/scheduledQueryRules@2023-03-15-preview`, name
  `${workloadName}-canary-5xx` (the `signal.alertName` is `canary-5xx`).
- `severity: 3`, `evaluationFrequency: 'PT5M'`, `windowSize: 'PT5M'`, `autoMitigate: true`.
- **Symptom-based** query over App Insights (workspace-based, queryable in the LAW):

  ```kql
  AppRequests
  | where TimeGenerated > ago(10m)
  | where Url contains "/products"
  | where Success == false or toint(ResultCode) >= 500
  | summarize Failures = count() by bin(TimeGenerated, 5m)
  ```

  threshold `GreaterThan 3` (rides out single blips; a live 50% canary produces steady failures).
  `contains "/products"` is used deliberately (not `has`) to avoid the whole-term tokenization pitfall.

### `query.kql` (investigation)

Pinpoints the canary slot and the root cause:

```kql
// Failed /products requests cluster on the staging slot's role instance
AppRequests
| where TimeGenerated > ago(30m)
| where Url contains "/products"
| summarize total = count(), failures = countif(Success == false) by AppRoleInstance
| extend failureRate = todouble(failures) / total
| order by failureRate desc
```

plus an exception drill-down surfacing the regression:

```kql
AppExceptions
| where TimeGenerated > ago(30m)
| where OuterMessage contains "Invalid column name"
| project TimeGenerated, ProblemId, OuterMessage, AppRoleInstance
```

(The exact slot dimension — `AppRoleInstance` vs `cloud_RoleInstance` — is verified against live
telemetry at implementation.)

## Validation — `validate.sh` / `validate.ps1`

Adapts the AKS health-probe template for a canary:

1. Resolve the production host name:
   `HOST=$(az webapp show -g "$RG" --name "$WEB" --query defaultHostName -o tsv)`.
2. Issue ~**12 cookie-less** `GET https://$HOST/products`. Each cookie-less request is independently
   routed, so a live 50/50 canary returns a mix of `200`/`500`.
3. Exit **non-zero** (unhealthy) if **any** response is non-`200` (fault present). Exit **0** (healthy)
   only if **all** are `200` — true after remediation clears routing to 100% production.

## Remediation

### Scripted operational rollback — `remediate.sh` / `remediate.ps1` (action `restore-traffic`)

1. `az webapp traffic-routing clear -g "$RG" --name "$WEB"` → 100% traffic back to the healthy
   production slot (immediate mitigation; `validate` passes after this step).
2. Rebuild the good `src/` and redeploy it to the `staging` slot so the slot no longer holds the bad
   build (clean reset; lets the scenario be re-run). Needs `dotnet` + `az`, consistent with `inject`.

Echoes the restored state. This mirrors AKS's `remediate.{sh,ps1}` (action `restore-cosmos-rbac`):
the action name need not equal the file basename on non-VM tracks.

### Durable Code-visible fix (GitOps, documented in the `docPage`)

The SRE Agent files a GitHub issue; `@copilot` opens a PR that either:

- **Reverts** the regression's `Sku` query back to `SELECT Id, Name, Price …` (recommended canonical
  fix — roll back the bad release; the cosmetic red reskin is harmless and need not be touched), or
- **Forward-fixes** `db/schema.sql` to add the `Sku` column and reseed (complete the release).

Merge → `deploy-appservice-app.yml` redeploys the corrected build → a clean 100%-good state. The PR is
a code change (not a script), so it lives in the docs, exactly as the AKS scenario keeps its GitOps fix
in its README.

## The manifest — `scenario.yaml`

```yaml
id: canary-bad-release
title: Canary Release Regression
track: appservice
summary: A new shop release with a SQL schema-mismatch bug is deployed to a staging slot and given 50% canary traffic, so ~half of /products calls return 500 while /health stays green and the production slot is unaffected.
severity: 3
estimatedMinutes: 30
difficulty: intermediate
learningObjectives:
  - Distinguish liveness (/health green) from a partial dependency failure (intermittent 500s on /products) caused by a canary slot.
  - Correlate intermittent 5xx with an App Service deployment slot taking canary traffic via App Insights AppRequests/AppExceptions broken down by role instance.
  - Roll back a bad canary operationally (clear traffic routing), then drive the durable fix through a GitHub issue / @copilot PR (GitOps).
signal:
  alertModule: alert.bicep
  alertName: canary-5xx
inject:
  bash: inject.sh
  powershell: inject.ps1
validate:
  bash: validate.sh
  powershell: validate.ps1
remediate:
  - action: restore-traffic
    bash: remediate.sh
    powershell: remediate.ps1
    description: Clear slot traffic routing (100% back to the healthy production slot) and redeploy the good build to the staging slot.
investigation:
  query: query.kql
docPage: README.md
```

## Generated artifacts (via `scripts/validate-scenarios.sh --write` — never hand-edited)

- `workshops/appservice/infra/bicep/modules/scenario-alerts.bicep` — **new** aggregator (first
  appservice scenario), with param `logAnalyticsResourceId`, wiring `canary-bad-release/alert.bicep`
  and passing it as `scopeResourceId`.
- `workshops/appservice/scenarios/INDEX.md` — new.
- The scenario table in `workshops/appservice/README.md`, between
  `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->`.

## Docs

`workshops/appservice/scenarios/canary-bad-release/README.md` (the `docPage`) — a walkthrough mirroring
the AKS scenario README: overview, prerequisites (`az`, .NET 10 SDK), the inject command, what to
observe (intermittent `/products` 500s while `/health` is green and the production slot is fine — and
visually, refreshing the site flips between the **green v1** and **red v2** shop), the
alert, the investigation query, the SRE Agent flow (detect → GitHub issue → `@copilot` revert PR +
`restore-traffic` rollback), the validate command, and cleanup. The cost note in
`workshops/appservice/README.md` is updated for the S1 plan.

## Testing & acceptance (offline; no live Azure required)

- Scaffold with `scripts/new-scenario.sh appservice canary-bad-release "Canary Release Regression"`,
  then fill in the manifest, scripts, alert, query, regression file, and README.
- `scripts/validate-scenarios.sh --write` then `scripts/validate-scenarios.sh` →
  `Scenario validation passed`, and `git status --porcelain` is empty (no drift).
- `cd scripts/scenario-tools && npm test` → all tests pass (the new scenario must not regress tooling
  tests).
- `az bicep build --file workshops/appservice/infra/bicep/main.bicep --stdout` → exit 0 (validates the
  S1 plan, the `staging` slot, and the wired `scenarioAlerts` module).
- `az bicep build` on `scenarios/canary-bad-release/alert.bicep` → exit 0 (also run by
  `validate-scenarios.yml` CI).
- `dotnet build` of `src/Program.cs` (the themed v1 landing page) and of a temp overlay
  (`src/` + `Program.regression.cs`) both compile (the regression is runtime-only).
- The `/` route returns `200` even when the products query fails (graceful catch), so only `/products`
  emits 5xx — confirmed by inspecting the handler or a local run.
- Every script ships as both `.sh` **and** `.ps1`; all `.sh` files are executable.
- All files committed and pushed (Code-visibility constraint).

## New / changed file tree

```
workshops/appservice/scenarios/canary-bad-release/
  scenario.yaml
  Program.regression.cs
  alert.bicep
  query.kql
  README.md
  inject.sh        inject.ps1
  validate.sh      validate.ps1
  remediate.sh     remediate.ps1
workshops/appservice/scenarios/INDEX.md                         (generated)
workshops/appservice/infra/bicep/modules/scenario-alerts.bicep  (generated)
workshops/appservice/infra/bicep/main.bicep                     (wire scenarioAlerts seam)
workshops/appservice/infra/bicep/modules/appservice.bicep       (S1 + staging slot)
workshops/appservice/src/Program.cs                             (themed v1 landing page; shared ProductsQuery; graceful catalog)
workshops/appservice/README.md                                  (scenario table + cost note)
.github/workflows/deploy-appservice-app.yml                     (seed good build to staging slot)
```

## Out of scope

- Multi-stage / escalating canary (split then full swap) — this scenario is a fixed 50% split.
- Slot auto-swap, autoscale, or VNet/private-endpoint changes to the substrate.
- The root cost-table redo (tracked in issue #7); this scenario only updates the App Service track
  cost note for S1.
- Any second scenario; this cycle delivers exactly one (`canary-bad-release`).
