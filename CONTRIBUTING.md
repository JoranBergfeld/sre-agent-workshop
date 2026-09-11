# Contributing

Thanks for extending the SRE Agent Workshop. Contributions are scenario
capsules: self-contained, reproducible incidents under `scenarios/<id>/`.
The platform is scenario metadata, not a directory hierarchy.

## Prerequisites

- Node.js 22+ for `scripts/scenario-tools/`
- Azure CLI with Bicep (`az bicep version`)
- PowerShell 7+ to exercise PowerShell script variants

## Add a scenario

1. Scaffold the canonical capsule:

   ```bash
   scripts/new-scenario.sh <id> "Title" --platform "Azure Service"
   # Example:
   scripts/new-scenario.sh memory-leak "Memory Leak" --platform "Azure Virtual Machines"
   ```

   The id is kebab-case and becomes `scenarios/<id>/`.

2. Complete the capsule. A scenario owns the files needed to set up, exercise,
   investigate, and clean up its incident:

   ```text
   scenarios/<id>/
   ├── scenario.yaml            # Catalog and lifecycle contract
   ├── README.md                # Learner entry point
   ├── docs/                    # Walkthrough modules
   ├── infra/bicep/             # Scenario infrastructure and alerts
   ├── scripts/                 # Setup, inject, validate, and cleanup pairs
   ├── knowledge/               # SRE Agent operational guidance
   ├── investigation/           # Optional KQL or other investigation assets
   ├── src/                     # Optional application source
   └── tests/                   # Optional scenario or application tests
   ```

3. Fill in `scenario.yaml`. Required fields are `id`, `title`, `platform`,
   `incidentType`, `summary`, `severity` (0–4), `estimatedMinutes`,
   `difficulty` (`beginner`, `intermediate`, or `advanced`), `costProfile`
   (`low`, `medium`, or `high`), `guide`, `pages`, `setup`, `inject`,
   `validate`, and `cleanup`. `id` must match the directory name; all
   referenced paths are relative to the capsule. See
   [`schemas/scenario.schema.json`](schemas/scenario.schema.json) for the
   authoritative contract.

4. Declare the learner journey in `pages`. Every scenario requires these
   semantic stages exactly once and in this order: `prerequisites`,
   `deploy-infrastructure`, `onboard-sre-agent`,
   `configure-incident-response`, `run-observe-scenario`, and `cleanup`.
   Additional pages use `optional: true` and may appear before, between, or
   after mandatory stages. The guide must link every declared page exactly
   once and in manifest order. Filenames and numeric prefixes remain
   scenario-specific.

5. Implement the lifecycle in both shells. `setup`, `inject`, `validate`, and
   `cleanup` each require Bash and PowerShell paths in the manifest. Every
   referenced Bash script must be executable. If the optional `remediate` list
   is present, each action also needs a Bash/PowerShell pair and an executable
   Bash script. Keep the learner guide, scripts, Bicep, and operational
   guidance in the same capsule.

   Do not make SRE Agent apply a remediation directly. VM scenarios use their
   local approval gate with a `CHG-`/`INC-` ticket, explicit `APPROVE`, and an
   audit record. AKS scenarios use the GitOps route: an issue assigned to
   `@copilot`, a Copilot pull request, and human deployment after merge. The
   Cloud Agent Handover scenario requires approval before the SRE Agent creates
   one unassigned issue. A learner reviews it and assigns
   `copilot-swe-agent`; a human merges the pull request, updates the local
   `main` checkout, and deploys it with the scenario's `deploy.sh` or
   `deploy.ps1` helper.

6. Validate locally:

   ```bash
   npm --prefix scripts/scenario-tools ci
   find scenarios/<id> -type f -name '*.sh' -exec chmod +x {} +
   npm --prefix scripts/scenario-tools test
   scripts/validate-scenarios.sh --write
   scripts/validate-scenarios.sh
   az bicep build --file scenarios/<id>/infra/bicep/main.bicep --stdout >/dev/null
   ```

   The second validation command must print `Scenario validation passed`.
   Run `--write` after every manifest change. It regenerates the root scenario
   catalog; do not edit the catalog table between
   `<!-- BEGIN SCENARIO CATALOG -->` and
   `<!-- END SCENARIO CATALOG -->` by hand.

7. Open a pull request. Use a conventional commit prefix such as `feat:`,
   `fix:`, `docs:`, `refactor:`, `ci:`, or `test:`.

## Scenario workflows

**Validate Scenarios** is the repository-wide structural gate. It checks the
manifest schema, mandatory learner-page flow, guide links, capsule lifecycle
files, scenario-tool tests, and generated-catalog drift. Executable capsule
tests and Bicep builds run in path-scoped scenario workflows so one capsule's
runtime failure does not obscure structural validation. Scenario
infrastructure changes run their named validation workflow, such as
**Validate Cosmos RBAC Removal Infrastructure** or **Validate CPU Runaway
Infrastructure**. Deployment workflows are explicitly named for their
scenario and are manually dispatched where deployment is required.

The Cloud Agent Handover capsule additionally uses **Validate Cloud Agent
Handover Application** for its application tests. After an approved Copilot
fix is reviewed and merged, the operator updates the local `main` checkout and
deploys the reviewed application with the scenario's Bash or PowerShell
deployment helper.

## Style

- Keep each scenario self-contained under `scenarios/<id>/`.
- Give a scenario a distinct default resource-name prefix so it can coexist
  with the other capsules.
- Link learner-facing documentation to top-level scenario paths.
- Change the manifest and regenerate derived artifacts instead of hand-editing
  generated catalog content.
