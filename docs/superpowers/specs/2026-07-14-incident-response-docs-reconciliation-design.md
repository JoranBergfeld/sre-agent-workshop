# Incident-Response Docs Reconciliation — Design

**Date:** 2026-07-14
**Status:** Approved (design)
**Scope:** Focused — the scenario-facing module docs only (the incident-response / "Break It" modules across all three tracks).

## Goal

Make every real scenario discoverable from each track's incident-response ("Break It") module, and fix
verified factual drift in those modules, using a **catalog-defer** pattern plus one short illustrative
example per track. After this change, adding or removing a scenario must not require editing the module
prose — the generated catalog stays the single source of truth.

## Background — the drift (verified)

The generated catalogs are already correct and complete: every track README's `## Scenarios` table and
`scenarios/INDEX.md` list all scenarios (aks: 2, vm: 4, appservice: 2). The tooling
(`scripts/validate-scenarios.sh`) keeps them in sync.

The drift lives entirely in the hand-written module walkthroughs, which were written when each track had
a *single* break scenario and never generalized as scenarios multiplied:

- **AKS `workshops/aks/docs/04-configure-incident-response.md`**
  - "Verify Alert Rules" states: *"You should see **two** alert rules: `srelab-container-restarts` … and
    `srelab-http-500-errors`."* This is inaccurate. `main.bicep` defines exactly **one** base alert,
    `${workloadName}-container-restarts` (queries `KubePodInventory`). The `http-500-errors` alert is not
    a base alert — it is the **cosmos-rbac-removal scenario's** alert, generated into the aggregator
    (`scenario.yaml` → `alertName: http-500-errors`, queries `ContainerLog`). The second scenario,
    **workload-identity-break**, contributes a third alert, `${workloadName}-workload-identity-auth-errors`
    (queries `ContainerLog`), which the doc omits entirely. So a fully deployed cluster shows **three**
    scheduled-query rules (1 base + 2 scenario), and the doc both under-counts and mislabels them.
  - "What Happens Next" / "Next Step" frame Module 5 as *only* removing the CosmosDB role assignment and
    link solely to `../scenarios/cosmos-rbac-removal/README.md`. `workload-identity-break` is invisible in
    the module flow.

- **App Service `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`**
  - "Verify Alert Rules" states the app has *"alert rules for HTTP 500 errors and App Service restarts,
    wired to query `AppServiceConsoleLogs` and `AppServiceHTTPLogs`."* This is inaccurate. `main.bicep`
    defines **no** base alerts at all — every alert comes from the scenario aggregator and queries
    Application Insights **`AppRequests`**: canary-bad-release → `${workloadName}-canary-5xx`,
    red-button-500 → `${workloadName}-redbutton-5xx`. There is no "App Service restarts" alert and no
    `AppServiceConsoleLogs`/`AppServiceHTTPLogs`-based alert.
  - "Next Step" still says *"the break scenario for this track is published separately … Once a scenario
    **is available**, follow its README."* This is a placeholder from when the track had zero scenarios;
    it now has two and links to neither.
  - "How It All Connects" and "What Happens Next" narrate a **removed SQL grant / Azure SQL** fault that
    matches **no** App Service scenario — copied-template drift describing a nonexistent scenario.

- **VM `workshops/vm/docs/02-configure-incident-response.md`**
  - In sync content-wise (its remediation-actions table references Scenarios 1–4), but terse (34 lines vs.
    ~157), it never links the scenario READMEs or the `## Scenarios` catalog, and offers no "choose a
    scenario" on-ramp, so the four VM scenarios are only *implied* by the actions table.

## Design principle — catalog-defer

The generated scenario catalog is the single source of truth for *which scenarios exist*:

- Primary catalog surface: each track README's `## Scenarios` table (between the
  `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->` markers). `scenarios/INDEX.md` is the equivalent
  standalone catalog.
- Each scenario's own `README.md` is a self-contained "Break It" module (inject → validate → let the
  agent remediate → manual fallback → cleanup).

Module docs therefore **point at the catalog** and at per-scenario READMEs, keep **one short illustrative
example** for narrative flow, and **never hardcode** a scenario count or an exhaustive scenario/alert list
that would re-drift.

## Per-file changes (docs only)

### 1. `workshops/aks/docs/04-configure-incident-response.md`

- **Verify Alert Rules section:** Replace the "you should see two alert rules" claim with an accurate,
  drift-resistant description:
  - `main.bicep` always deploys the base alert `${workloadName}-container-restarts` (queries
    `KubePodInventory`).
  - Each enabled scenario adds **its own** alert via the generated aggregator — e.g., cosmos-rbac-removal
    → `…-http-500-errors`, workload-identity-break → `…-workload-identity-auth-errors` (both query
    `ContainerLog`).
  - Keep the existing `az … --resource-type "Microsoft.Insights/scheduledQueryRules" --query "[].name"`
    command so learners see whatever is actually deployed; describe the expected set as "the base
    `container-restarts` alert **plus one per scenario**," not a fixed number.
- **What Happens Next / Next Step:** Keep the CosmosDB-role-removal narrative as the **illustrative
  example** (it is concrete and engaging), but reframe Module 5 as "choose a Break It scenario from the
  catalog," linking the track README `## Scenarios` table. Ensure `workload-identity-break` is reachable
  (via the catalog link), not just cosmos. Each scenario README is its own self-contained Module 5.

### 2. `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`

- **Verify Alert Rules section:** Fix the inaccurate description:
  - App Service has **no base alerts**; all alerts come from scenarios and query Application Insights
    **`AppRequests`** — canary-bad-release → `…-canary-5xx`, red-button-500 → `…-redbutton-5xx`.
  - Remove the `AppServiceConsoleLogs` / `AppServiceHTTPLogs` / "App Service restarts" wording. Keep the
    `az … scheduledQueryRules --query "[].name"` command; describe the alerts as "one per scenario,
    querying App Insights `AppRequests`." Concrete names (default `workloadName=srelabapp`):
    `srelabapp-canary-5xx`, `srelabapp-redbutton-5xx`.
- **How It All Connects / What Happens Next:** These sections currently narrate a **removed SQL grant /
  Azure SQL authentication** fault that matches **no** App Service scenario (the track has only
  `canary-bad-release` and `red-button-500`) — leftover drift from a copied template. Reframe both to the
  catalog-defer pattern using **red-button-500** as the illustrative example: the learner picks a Break It
  scenario from the catalog, and — for example — the red-button-500 scenario's red button triggers an HTTP
  500 that Azure Monitor detects, the agent investigates, and the fix flows through GitHub. Do not
  reference SQL/Azure SQL anywhere.
- **Next Step:** Replace the "published separately / once a scenario is available" placeholder with the
  catalog-defer pattern: link the track README `## Scenarios` table, and use **red-button-500** as the
  short illustrative example (the minimal green/red two-button 500 demo — the natural beginner on-ramp),
  noting each scenario README is its own Break It module.

### 3. `workshops/vm/docs/02-configure-incident-response.md`

- Add a short "Choose a Break It scenario" pointer so all four VM scenarios are discoverable via their
  READMEs and the track README `## Scenarios` catalog. Name **`disk-full`** as the beginner illustrative
  example.
- Preserve everything track-specific: the approval-gated execution model, the remediation-actions table,
  the `Invoke-ApprovedRemediation` example, and the "no GitHub issue logging on this track" callout. Do
  **not** restructure the VM doc beyond adding the catalog pointer/example.

### Illustrative example per track

| Track | Illustrative example | Full set via catalog |
|---|---|---|
| aks | `cosmos-rbac-removal` | README `## Scenarios` (also `workload-identity-break`) |
| appservice | `red-button-500` | README `## Scenarios` (also `canary-bad-release`) |
| vm | `disk-full` | README `## Scenarios` (also cpu-runaway, iis-app-pool, vm-size-retirement) |

## Non-goals / out of scope

- The shared concept layer (`docs/00-…`, `01-…`, `02-…`) and `docs/connect-github-to-sre-agent.md`.
- Prerequisites / deploy / watch / cleanup module docs (`00`, `01`, `02`-deploy, `90`, `99`).
- README prose outside the generated `## Scenarios` tables; the generated tables and `INDEX.md`
  themselves (already correct — never hand-edited).
- Any structural rewrite of the VM incident-response doc.
- Any code, tooling, Bicep, or scenario-manifest change. This is a **docs-only** change.

## Validation

- Every scenario link added/changed resolves to an existing `README.md` (relative paths correct).
- No remaining hardcoded scenario counts or exhaustive alert lists in the three edited docs.
- No remaining `SQL` / `Azure SQL` fault narrative in the App Service doc (it describes a nonexistent
  scenario).
- `scripts/validate-scenarios.sh` still prints `Scenario validation passed` (docs edits must not touch
  generated artifacts; run it as a guard).
- Spot-check the alert names cited against the manifests/Bicep (`container-restarts`, `http-500-errors`,
  `workload-identity-auth-errors`, `canary-5xx`, `redbutton-5xx`).

## Risks / considerations

- **Example staleness:** a named illustrative example is itself a hardcoded reference. Risk is low
  (examples are stable, and the catalog link carries the full list), and far smaller than the current
  "THE scenario" framing. If an example scenario is ever removed, only a single "for example" mention
  needs updating — the catalog pointer keeps discovery correct regardless.
- **Cross-track consistency:** aks and appservice share the same `04` structure and will end up parallel;
  vm keeps its distinct approval-gated structure by design.
