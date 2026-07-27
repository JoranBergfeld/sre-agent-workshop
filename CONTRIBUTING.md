# Contributing

Thanks for extending the SRE Agent Workshop! The most common contribution is **a new
scenario**. Scenarios are self-contained folders governed by a manifest contract. In most
cases, adding one does not require hand-editing shared infrastructure or tooling because the
generator updates the track's derived artifacts; a scenario that introduces a new track-wide
capability may still require focused shared changes.

## Prerequisites

- Node.js 22+ (for the scenario tooling under `scripts/scenario-tools/`)
- Azure CLI with Bicep (`az bicep version`)
- PowerShell 7+ if you want to run the `.ps1` script variants

## Add a scenario (the 6-step flow)

1. **Scaffold** from the canonical template:

   ```bash
   scripts/new-scenario.sh <track> <scenario-id> "Human Title"
   # e.g. scripts/new-scenario.sh vm memory-leak "Memory Leak"
   ```

   `<track>` is `aks`, `vm`, or `appservice`; `<scenario-id>` is kebab-case and becomes
   the folder name.

2. **Fill in `scenario.yaml`.** Required: `id` (== folder name), `title`, `track`,
   `summary`, `severity` (0–4), `inject`, `validate`, and `docPage`. Optional:
   `estimatedMinutes`, `difficulty`, `learningObjectives`, `signal`, `remediate`, and
   `investigation`. The full contract lives in
   [`schemas/scenario.schema.json`](schemas/scenario.schema.json).

3. **Implement the scripts** — both `.sh` and `.ps1` are required for `inject` and
   `validate`. Remediation is optional; when `remediate` is present, every action also needs
   both shell variants.

   The remediation script basename must equal `action` only on the **VM** track, whose
   approval gate resolves actions by globbing `scenarios/*/<action>.sh`. Do not apply that
   rule globally: the AKS track intentionally uses `action: restore-cosmos-rbac` with
   `remediate.sh` and `remediate.ps1`. Action names must still be unique within each track.

4. **Author the optional signal and investigation files.** When a scenario includes
   `signal`, its `alert.bicep` must declare exactly `location`, `workloadName`, `tags`, and
   `scopeResourceId`, and bind `scopes: [scopeResourceId]`. The generator wires it into the
   track aggregator automatically. If the scenario needs no alert, omit `signal` and
   `alert.bicep`. When `investigation` is present, add the referenced query file (normally
   `query.kql`).

5. **Write `README.md`** — the attendee walkthrough (inject → observe → investigate →
   remediate → validate).

6. **Generate + validate**:

   ```bash
   scripts/validate-scenarios.sh --write   # regenerates INDEX.md, aggregator, README table
   scripts/validate-scenarios.sh           # must print "Scenario validation passed"
   chmod +x workshops/<track>/scenarios/<id>/*.sh
   ```

Open a PR. CI (`validate-scenarios.yml`) re-runs the schema check, unit tests, drift check,
and `az bicep build` on every `alert.bicep` + aggregator.

## What CI enforces

- `scenario.yaml` validates against the schema.
- `id` == folder name; `track` == parent track directory.
- Required files exist; `.sh` scripts are executable; both `.sh` and `.ps1` exist for
  `inject` / `validate` / each `remediate` action.
- Every `alert.bicep` is wired into the generated `scenario-alerts.bicep`.
- `INDEX.md` and the README scenario table are regenerated and unchanged (no drift).
- Remediation action names are unique within a track.

## Add a track (advanced)

Tracks are the closed set in `scripts/scenario-tools/lib/paths.js` (`TRACKS`). Current
registrations are:

- `aks` → `clusterId`
- `vm` → `logAnalyticsResourceId`
- `appservice` → `logAnalyticsResourceId`

To add another track:

1. Add an entry to `TRACKS` with its alert `scopeParam`, the Bicep parameter the generated
   aggregator passes into each scenario's `scopeResourceId`.
2. Add the track value to `schemas/scenario.schema.json`
   (`properties.track.enum`).
3. Create `workshops/<track>/` with `README.md` (include the
   `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->` markers), `docs/`, `infra/bicep/`,
   and `scenarios/`.
4. If the track deploys alerts, have `infra/bicep/main.bicep` call the generated
   `modules/scenario-alerts.bicep` with the track's scope resource ID.
5. Add a workflow `validate-<track>-infra.yml` mirroring the existing ones, repathed to
   `workshops/<track>/infra/**`.
6. Scaffold a first scenario and run `scripts/validate-scenarios.sh --write`.

## Style

- Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `ci:`, `test:`).
- Keep scenarios self-contained: prefer adding files under `scenarios/<id>/` over editing
  shared tooling.
