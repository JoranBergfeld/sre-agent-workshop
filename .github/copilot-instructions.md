# Copilot Instructions — SRE Agent Workshop

## What this repository is

A hands-on workshop that teaches **Azure SRE Agent** incident response through a
**multi-track, scenario-based framework**. A *track* is a self-contained workshop variant
(a different Azure platform); a *scenario* is a self-contained, reproducible fault a learner
injects, then watches the SRE Agent detect, diagnose, and drive to remediation via a GitHub
issue → Copilot PR → deploy (GitOps).

Two transitional workshop tracks ship today:

- **`workshops/aks/`** — AKS + CosmosDB + a Node.js app (the original tutorial).
- **`workshops/vm/`** — a VM / enterprise-migration track with an approval-gated remediation model.

The top-level **`scenarios/cloud-agent-handover/`** capsule is the minimal .NET 10 Blazor handover
scenario for the Cloud Agent.

The framework is meant to be **extended by contributors** — `CONTRIBUTING.md` is the contract.
When adding or changing anything, prefer the scenario tooling and keep the per-track structure intact.

## Repository structure

```
README.md                     # Root scenario catalog / quickstart
docs/                         # Shared, track-agnostic concept layer (00-what / 01-why / 02-how)
scenarios/<id>/               # Canonical scenario capsules for new and migrated work
workshops/<track>/            # Legacy platform-specific paths kept operational during migration
schemas/scenario.schema.json  # The scenario manifest contract (JSON Schema draft 2020-12)
scripts/
  new-scenario.sh             # Scaffold a scenario capsule
  validate-scenarios.sh       # Validate + (--write) regenerate the catalog and derived artifacts
  scenario-tools/             # Node ESM tooling behind the wrappers
.github/workflows/            # Scenario CI, docs readiness, and migration-era track workflows
```

## The scenario framework (read before touching scenarios)

A scenario lives in `scenarios/<id>/` and is driven by a `scenario.yaml` manifest. Tooling under
`scripts/scenario-tools/` (Node ESM; `bin/{validate,generate,new-scenario}.js`,
`lib/{validate,generate,paths}.js`) validates manifests and **generates** the catalog and any
compatibility artifacts for migrated scenarios. Never hand-edit a generated artifact — change the
manifest and regenerate.

- **Scaffold:** `scripts/new-scenario.sh <id> "Title" --platform <platform>` (`<id>` kebab-case).
- **Validate / regenerate:** `scripts/validate-scenarios.sh --write` then `scripts/validate-scenarios.sh`
  (must print `Scenario validation passed`).
- **Unit tests:** `cd scripts/scenario-tools && npm test` (Node `--test`).
- **Generated (do not edit by hand):**
  - The root `README.md` scenario catalog.
  - Any generated scenario indexes or compatibility aggregators.
  - The scenario table between `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->` in any
    migration-era track README.
- **Legacy tracks remain operational until migrated:** keep the existing `workshops/aks/` and
  `workshops/vm/` paths working while their assets move into top-level scenario capsules.

### Scenario manifest (`scenario.yaml`)

Required: `id` (== folder name), `title`, `platform`, `incidentType`, `summary`, `severity`
(`0–4`), `estimatedMinutes`, `difficulty` (`beginner|intermediate|advanced`), `costProfile`,
`guide`, `setup`, `inject`, `validate`, `cleanup`. Common optional: `learningObjectives`,
`signal` (`alertModule`/`alertName`), `remediate` (list of `{action, bash, powershell,
description}`), `investigation` (`query`), `source`, `tests`.
The authoritative contract is `schemas/scenario.schema.json`.

### Scenario conventions

- **Always ship both shells:** `setup`, `inject`, `validate`, `cleanup`, and every `remediate`
  action need both Bash and PowerShell paths. Bash references must point to executable scripts.
- **Remediation is optional.** A scenario without `remediate` still needs both
  shells for `inject` and `validate`; the App Service handover intentionally has no remediation scripts.
- **`alert.bicep`** must declare exactly `location`, `workloadName`, `tags`, `scopeResourceId`,
  and bind `scopes: [scopeResourceId]`. If a scenario needs no alert, omit `signal` and delete `alert.bicep`.
- **`action` naming is track-dependent.** The **VM** approval gate
  (`workshops/vm/tools/invoke-approved-remediation.sh` / `Invoke-ApprovedRemediation.ps1`) resolves
  `--action` by globbing `scenarios/*/<action>.sh`, so on the VM track the remediation script basename
  **must equal** the action and actions are unique per track. The **AKS** track has no such gate and
  deliberately uses `action: restore-cosmos-rbac` with files `remediate.{sh,ps1}` — do **not** enforce
  basename==action globally.
- **Avoid drift:** any manifest change requires re-running `--write`; CI fails if `INDEX.md`, the
  aggregator, or the README table are stale.

## Track specifics

### AKS (`workshops/aks/`)

- Resource names follow `{workloadName}-{type}` (default `srelab`). CosmosDB uses the **NoSQL (Core)
  API** with `@azure/cosmos` (NOT MongoDB); endpoint `https://{name}-cosmos-{suffix}.documents.azure.com:443/`.
- Auth chain: Pod → K8s OIDC → federated credential → UAMI → CosmosDB RBAC. Namespace `workshop`,
  ServiceAccount `workshop-app` (must match the federated credential in `infra/bicep/modules/identity.bicep`).
- Alerts are `Microsoft.Insights/scheduledQueryRules` (log-based) over `ContainerLog`/`KubePodInventory`.
  The shipped `cosmos-rbac-removal` scenario's `inject`/`remediate` remove/recreate the
  `cosmosRoleAssignment` in `infra/bicep/modules/identity.bicep` (built with inline `resourceId()` to
  avoid ARM caching); its http-500 alert is generated into the aggregator.
- App: `src/app/server.js` (Express; `/`, `/health`, `/items`; `DefaultAzureCredential`). Image at
  `ghcr.io/<owner>/sre-agent-workshop/app:latest`; the `OWNER` placeholder in `k8s/deployment.yaml`
  is substituted by the publish workflow.

### VM (`workshops/vm/`)

- Remediation is **approval-gated**: `tools/invoke-approved-remediation.sh` (PowerShell:
  `Invoke-ApprovedRemediation.ps1`) maps an action to a scenario-owned script, requires a `CHG`/`INC`
  ticket plus an explicit `APPROVE`, and writes an audit entry. The SRE Agent never runs remediation directly.

### App Service (`scenarios/cloud-agent-handover/`)

- Minimal .NET 10 Blazor app with `/health` and `POST /api/feature`; the feature
  endpoint intentionally throws until the Copilot issue fix is merged.
- The fixed endpoint contract is exactly
  `{"status":"completed","message":"The unfinished feature is now implemented."}`.
- Infrastructure is a B1 Linux App Service with Application Insights and a Log
  Analytics workspace. Local Bash and PowerShell setup scripts provision the
  resources and deploy the starting application.
- GitHub Actions authenticates through OIDC using a user-assigned managed
  identity and federated identity credential. App changes merged to `main`
  automatically run the application deployment workflow.

## Workflows (`.github/workflows/`, shared across tracks)

- **AKS:** `deploy-aks-infra.yml` (**manual `workflow_dispatch` only** — region/workload chosen at
  deploy time), `deploy-aks-app.yml` (manual dispatch), `publish-aks-image.yml` (push on
  `workshops/aks/src/**`; GHCR, lowercased owner), `validate-aks-infra.yml` (push/PR on
  `workshops/aks/infra/**`; syntax + what-if).
- **VM:** `deploy-vm-infra.yml`, `validate-vm-infra.yml`.
- **App Service:** `validate-appservice-infra.yml` (**Validate Cloud Agent
  Handover Infrastructure**, credential-free PR/main syntax check),
  `preview-cloud-agent-handover-infra.yml` (**Preview Cloud Agent Handover
  Infrastructure**, manual Azure what-if with `AZURE_CREDENTIALS`),
  `validate-appservice-app.yml` (**Validate Cloud Agent Handover
  Application**), and `deploy-appservice-app.yml` (**Deploy Cloud Agent
  Handover Application**). The deployment runs automatically for app/test
  changes pushed to `main` and also supports manual dispatch.
- **Framework:** `validate-scenarios.yml` — schema check, unit tests, drift check, and `az bicep build`
  on every `alert.bicep` + aggregator.
- **Docs freshness:** `sre-docs-freshness.md` is the gh-aw **source**; `sre-docs-freshness.lock.yml`
  (and `.github/aw/actions-lock.json`) are generated — edit the `.md` and recompile with `gh aw compile`.
- AKS and VM infrastructure deployments remain manual. App Service
  infrastructure validation is credential-free, the Cloud Agent handover
  preview workflow is manual only, and the application deployment is automatic
  on qualifying pushes to `main`. In the Actions tab, refer to workflows by
  their track-qualified display names. AKS deploy/validate workflows
  authenticate with the `AZURE_CREDENTIALS` secret; `publish-aks-image.yml`
  uses `GITHUB_TOKEN`/GHCR; App Service deployment uses OIDC repository
  variables provisioned by the local setup scripts.

## Docs & the SRE Agent

- **Concept layer:** `docs/00-what-is-sre-agent.md`, `01-why-sre-agent.md`, `02-how-it-works.md`
  (track-agnostic).
- **Operational guidelines:** AKS uses
  `workshops/aks/knowledge/operational-guidelines.md`: no direct Azure changes,
  fixes go through an issue assigned to `@copilot`, and an operator manually
  triggers the AKS deployment after merge. VM retains its explicit
  ticket-and-approval remediation gate. App Service uses
  `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`: the SRE Agent asks
  for approval before creating one issue assigned to `copilot-swe-agent`, a
  human reviews and merges the Copilot pull request, and the merge triggers the
  automatic OIDC-based **Deploy Cloud Agent Handover Application** workflow.

## Contributing

`CONTRIBUTING.md` is the contract: the 6-step scenario flow, what CI enforces, and the add-a-track
procedure. Follow it (and the tooling) rather than wiring scenarios in by hand.
