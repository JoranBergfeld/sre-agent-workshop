# Design — App Service Track Substrate

Stand up a third workshop track, `appservice`, that hosts a **.NET 10** shop on
**Azure App Service (Linux)** backed by **Azure SQL Database**, instrumented and wired into the
existing scenario framework — so a later cycle can author a "break it" scenario on top.

## Problem & Goal

The repo has two tracks — `aks` (Node.js + CosmosDB, GitOps remediation) and `vm` (Windows + IIS,
approval-gate remediation). There is no PaaS / App Service track, and App Service cannot reuse
either substrate. We want a new `appservice` track that is consistent with the AKS track's
GitOps/@copilot narrative but exercises a different compute + data stack, giving future scenarios a
fresh fault surface.

**Goal of this spec:** design the *substrate only* — infrastructure, the .NET shop app, monitoring,
CI/CD, docs, and framework registration. The break scenario is explicitly a **separate, later
brainstorm → spec → plan cycle**.

## Scope & decomposition

This work was deliberately decomposed. This spec covers piece (1); piece (2) is future:

1. **Substrate (this spec):** the `appservice` track with a working, deployable, observable shop —
   but **zero scenarios**.
2. **First break scenario (future cycle):** injects a fault, adds detection alert(s), remediation,
   validation, and wires `modules/scenario-alerts.bicep` into `main.bicep`.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend data store | **Azure SQL Database** | Idiomatic for a .NET shop; distinct from AKS's CosmosDB; rich future fault surface (firewall, AAD auth, contained users). |
| App → SQL auth | **Passwordless** — App Service user-assigned managed identity, AAD auth to SQL | Best practice; consistent with the AKS managed-identity theme; no secrets. |
| Delivery | **Native .NET 10**, CI `dotnet publish` → `az webapp deploy --type zip`, build-on-deploy off | Registry-free (no shared GHCR image that forks could break); deterministic; commit-correlated artifacts give the SRE agent deploy↔commit context. |
| Runtime | `linuxFxVersion: DOTNETCORE\|10.0` | User-selected .NET 10 (verify the exact runtime string against `az webapp list-runtimes --os linux` at implementation). |
| App Service Plan tier | **B1 Linux Basic** | Cheapest viable (~$0.02/hr); supports managed identity, VNet integration, Always On. No slots/autoscale (bump to S1 only if a future scenario needs slots). |
| DB access grant | **Least-privilege contained user via CI `sqlcmd`** | Bicep can't run T-SQL; the workflow runs committed `db/grant.sql` (`CREATE USER … WITH SID`, `db_datareader`). Commit-visible, robust, no MS-Graph dependency. |
| Remediation model | **GitOps** — @copilot PRs against Bicep; attendee triggers the manual infra-deploy workflow | Consistent with AKS; matches the manual-dispatch infra-deploy convention. |
| Alert scope param | `logAnalyticsResourceId` | App Service logs flow to a Log Analytics workspace; `scheduledQueryRules` scope to the workspace (same as the VM track). |

## Architecture — resource topology

`workshops/appservice/infra/bicep/main.bicep` (resourceGroup scope), mirroring AKS conventions.

**Params:** `location` (`@allowed` `eastus2`/`swedencentral`/`australiaeast`, default `eastus2`),
`workloadName` (default `srelab`), `tags`, `sqlAadAdminObjectId` (principal set as SQL AAD admin —
the deploying SP). `uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 4)`.

**Module composition order:** `monitoring → identity → sql → appservice → [alert seam]`

| Module | Resources | Names (`{workloadName}-{type}`) |
|---|---|---|
| `monitoring.bicep` | Log Analytics workspace + **workspace-based** Application Insights | `srelab-logs`, `srelab-appi` |
| `identity.bicep` | User-assigned managed identity (outputs `principalId`, `clientId`, `id`) | `srelab-id` |
| `sql.bicep` | SQL logical server (AAD-only auth, AAD admin = `sqlAadAdminObjectId`) + database (Basic) + firewall rule "Allow Azure services" (start/end `0.0.0.0`) | `srelab-sql-{suffix}`, `srelab-db` |
| `appservice.bicep` | App Service Plan (B1 Linux, `reserved: true`) + Web App (`DOTNETCORE\|10.0`, HTTPS-only, Always On, health-check path `/health`, assigned `srelab-id`) | `srelab-plan`, `srelab-web-{suffix}` |

**Web App app settings:**
- `APPLICATIONINSIGHTS_CONNECTION_STRING` = `monitoring.outputs.appInsightsConnectionString`
- `AZURE_SQL_CONNECTIONSTRING` = `Server=tcp:srelab-sql-{suffix}.database.windows.net,1433;Database=srelab-db;Authentication=Active Directory Managed Identity;User Id={uami.clientId};Encrypt=True;TrustServerCertificate=False`
- `SCM_DO_BUILD_DURING_DEPLOYMENT` = `false`

**Outputs (`main.bicep`):** `webAppName`, `webAppHostName`, `sqlServerName`, `sqlDatabaseName`,
`logAnalyticsId`, `uamiClientId`, `uamiPrincipalId` — consumed by the deploy/app workflows and the
future alert seam.

## The .NET 10 shop app

`workshops/appservice/src/` — a thin .NET 10 minimal API, mirroring the AKS app's `/`, `/health`,
`/items` shape:

- `GET /health` → `200` always, **no DB call** (liveness; also the App Service health-check path).
- `GET /` → landing page showing SQL connectivity status.
- `GET /products` → reads a `Products` table via `Microsoft.Data.SqlClient` using
  `AZURE_SQL_CONNECTIONSTRING`; returns the catalog as JSON. On failure: **`500`** + the exception
  logged via `ILogger` to console.
- Telemetry: `Microsoft.ApplicationInsights.AspNetCore` auto-collects requests, dependencies, and
  exceptions (SQL failures surface in `AppExceptions` / `AppDependencies`); console errors surface in
  `AppServiceConsoleLogs`.

This produces the canonical **"health green / business endpoint 500"** signal that future scenario
alerts key on. Data access is raw `Microsoft.Data.SqlClient` (no EF) to keep the connection-auth
story explicit and the app minimal.

Project files: `Shop.csproj` (targets `net10.0`), `Program.cs`, `appsettings.json`, `global.json`
(pins the .NET 10 SDK), `Models/Product.cs`.

## Passwordless SQL access (the grant chain)

Bicep provisions the server/db/UAMI and sets the **SQL AAD admin to the deploying SP**
(`sqlAadAdminObjectId`). The data-plane grant runs in CI, not Bicep:

`deploy-appservice-app.yml`, after the zip deploy, runs `sqlcmd -G` (AAD auth as the admin SP)
against `srelab-db`:

1. `db/schema.sql` — `CREATE TABLE Products (...)` (idempotent) + seed a handful of catalog rows.
2. `db/grant.sql` — create the contained user for the app identity and grant read:
   ```sql
   -- @uamiName / @uamiClientId substituted by the workflow from deploy outputs
   CREATE USER [srelab-id] WITH SID = <clientId-as-binary>, TYPE = E;
   ALTER ROLE db_datareader ADD MEMBER [srelab-id];
   ```
   The `WITH SID = …, TYPE = E` form (SID derived from the UAMI **client id**) creates the
   external-provider user **without** an MS-Graph lookup, so the SQL server needs no Directory
   Readers permission — fully reproducible in CI.

Both scripts are committed and idempotent (safe to re-run on every app deploy), and are
commit-visible context for the SRE agent. The grant is a clean fault target for a future scenario.

## Monitoring & alert seam

- **Workspace-based App Insights** (`srelab-appi` linked to `srelab-logs`) → app telemetry in
  `AppRequests` / `AppExceptions` / `AppDependencies`.
- **App Service diagnostic settings** route platform logs to the *same* workspace:
  `AppServiceConsoleLogs`, `AppServiceHTTPLogs`, `AppServicePlatformLogs`, and `AllMetrics`.
- One workspace therefore carries both app-level and platform-level signal; a future scenario alert
  can key on whichever fits.
- **Alert seam:** `main.bicep` carries a clearly-marked comment block
  (`// SCENARIO ALERTS — wired by first scenario cycle`) at the point where the generated
  `modules/scenario-alerts.bicep` call will be added, passing
  `logAnalyticsResourceId: monitoring.outputs.logAnalyticsId`. No call ships in the substrate
  (zero scenarios → no generated aggregator file).

## Framework registration (substrate-owned)

These register the track and are harmless with zero scenarios — `listTracks()` filters by the
existence of `workshops/appservice/scenarios/`, so the generator/validator skip the track until the
first scenario lands, keeping `validate-scenarios.sh` green and drift-free:

- `schemas/scenario.schema.json` — add `"appservice"` to `properties.track.enum`.
- `scripts/scenario-tools/lib/paths.js` — add `appservice: { scopeParam: 'logAnalyticsResourceId' }`
  to `TRACKS`.

## CI/CD workflows

In `.github/workflows/`, mirroring AKS naming and the manual-dispatch-infra convention; all use the
`AZURE_CREDENTIALS` secret:

- `validate-appservice-infra.yml` — push/PR on `workshops/appservice/infra/**` → `bicep build` +
  `az deployment group what-if`.
- `deploy-appservice-infra.yml` — **manual `workflow_dispatch` only** (inputs: `region`,
  `workloadName`). Derives `sqlAadAdminObjectId` from the deploying SP, then
  `az deployment group create`.
- `deploy-appservice-app.yml` — push on `workshops/appservice/src/**` and `workshops/appservice/db/**`
  (+ manual): pinned .NET 10 SDK → `dotnet publish -c Release` → zip →
  `az webapp deploy --type zip` → `sqlcmd -G` runs `db/schema.sql` + `db/grant.sql`.
- `validate-scenarios.yml` is generic — unchanged.

## Docs, knowledge & READMEs

- `workshops/appservice/docs/` — mirror the AKS module set: `00-prerequisites`,
  `01-deploy-infrastructure`, `02-deploy-application`, `03-onboard-sre-agent`,
  `04-configure-incident-response`, `90-watch-sre-agent`, `99-cleanup`.
- `workshops/appservice/knowledge/operational-guidelines.md` — adapted from AKS (never make direct
  Azure changes; always create GitHub issues for @copilot; GitOps).
- `workshops/appservice/README.md` — modules list, `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->`
  markers (generator fills the table once scenarios exist), and a track cost note.
- Root `README.md` — add an App Service track entry to the track overview. The full root cost-table
  redo is deferred to issue #7 (per-scenario cost); the substrate adds only a track-level cost note.

## Deliverable file tree

```
workshops/appservice/
  README.md
  infra/bicep/
    main.bicep
    main.bicepparam
    modules/
      monitoring.bicep
      identity.bicep
      sql.bicep
      appservice.bicep
  src/
    Shop.csproj
    Program.cs
    appsettings.json
    global.json
    Models/Product.cs
  db/
    schema.sql
    grant.sql
  docs/                      (7 module files, mirroring AKS)
  knowledge/operational-guidelines.md
.github/workflows/
  validate-appservice-infra.yml
  deploy-appservice-infra.yml
  deploy-appservice-app.yml
schemas/scenario.schema.json                       (add "appservice" to track enum)
scripts/scenario-tools/lib/paths.js                (add appservice TRACKS entry)
README.md                                          (add App Service track entry)
```

## Cost (track README)

| Resource | ~Cost/hr | Notes |
|---|---|---|
| App Service Plan (B1 Linux) | ~$0.018 | Always On enabled |
| Azure SQL Database (Basic) | ~$0.007 | 5 DTU, minimal |
| Log Analytics + App Insights | ~$0.10 | Standard monitoring |
| SRE Agent | ~$0.50 | Depends on model/volume |

Remember to run **Cleanup** (module 99); idle resources still bill.

## Testing & acceptance

- `az bicep build --file workshops/appservice/infra/bicep/main.bicep --stdout` → exit 0, no `ERROR`
  lines.
- `dotnet publish -c Release` (in `workshops/appservice/src/`) → succeeds with .NET 10 SDK.
- `db/schema.sql` and `db/grant.sql` present and parseable.
- `scripts/validate-scenarios.sh` → `Scenario validation passed`; `--write` leaves no drift
  (`git status --porcelain` empty) — track registered, zero scenarios.
- `cd scripts/scenario-tools && npm test` → 13/13 pass (no regression from the new `TRACKS` entry).

Live Azure deployment is **not** required for substrate acceptance; validation is offline (build +
framework checks). End-to-end deploy is exercised when a real workshop run uses the workflows.

## Out of scope (this spec)

- Any break scenario, alert, or `scenario-alerts.bicep` wiring into `main.bicep` (future cycle).
- Deployment slots / autoscale (would need an S1+ tier).
- The full root cost-table redo (tracked in issue #7).
- VNet integration / private endpoints for SQL (substrate uses the "Allow Azure services" firewall
  rule for simplicity).
- Key Vault / secret-based connection strings (the substrate is passwordless).
