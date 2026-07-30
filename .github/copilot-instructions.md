# Copilot Instructions — SRE Agent Workshop

## What this repository is

This is a scenario-first workshop for Azure SRE Agent incident response. Each
`scenarios/<id>/` directory is a self-contained capsule: a learner provisions
the scenario, injects a reproducible fault, observes investigation, and follows
its approved recovery route.

The root `README.md` generated scenario catalog is the canonical entry point.
`platform` in `scenario.yaml` describes the Azure service used by a capsule; it
is metadata, not a repository hierarchy. Default resource-name prefixes are
distinct across the supplied scenarios.

## Repository structure

```text
README.md                     # Canonical generated scenario catalog
CONTRIBUTING.md               # Capsule contribution contract
docs/                         # Shared concept layer
scenarios/<id>/
  scenario.yaml               # Catalog and lifecycle contract
  README.md                   # Learner entry point
  docs/                       # Walkthrough modules
  infra/bicep/                # Scenario resources and alert modules
  scripts/                    # Bash and PowerShell lifecycle scripts
  knowledge/                  # SRE Agent operational guidance
  investigation/              # Optional KQL and investigation assets
  src/                        # Optional application source
  tests/                      # Optional scenario or application tests
.devcontainer/<id>/           # Codespaces definition for one scenario
schemas/scenario.schema.json  # Scenario manifest contract
scripts/
  new-scenario.sh             # Scaffold a scenario capsule
  validate-scenarios.sh       # Validate and regenerate derived artifacts
  scenario-tools/             # Node ESM tooling behind the wrappers
.github/workflows/            # Scenario validation and deployment CI
```

## Scenario framework

Use `scripts/new-scenario.sh <id> "Title" --platform "Azure Service"` to
create a kebab-case capsule under `scenarios/<id>/`. The manifest requires
`id`, `title`, `platform`, `incidentType`, `summary`, `severity`,
`estimatedMinutes`, `difficulty`, `costProfile`, `guide`, `setup`, `inject`,
`validate`, and `cleanup`. The schema is authoritative.

Every `setup`, `inject`, `validate`, and `cleanup` lifecycle operation needs
both Bash and PowerShell paths. Referenced Bash scripts must be executable.
Optional `remediate` actions also need both shells; remediation itself is never
performed directly by the SRE Agent.

Run the following after changing manifests or capsule content:

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

`--write` regenerates the root catalog. Never hand-edit the content between
`<!-- BEGIN SCENARIO CATALOG -->` and `<!-- END SCENARIO CATALOG -->`; change
the manifest instead.

## Approved recovery models

- **VM capsules:** remediation is approval-gated. The SRE Agent investigates
  and proposes an action, but an authorized operator supplies a `CHG-` or
  `INC-` ticket, enters explicit `APPROVE`, and invokes the scenario-local
  approved-remediation tool. The tool runs only the allowed action and writes
  an audit entry.
- **AKS capsules:** no direct Azure changes. The SRE Agent produces an issue
  assigned to `@copilot`; Copilot creates a pull request; a human reviews and
  merges it; an operator manually deploys the approved change.
- **Cloud Agent Handover:** the SRE Agent asks for approval before creating one
  unassigned issue. A learner reviews it and assigns `copilot-swe-agent`; a
  human reviews and merges Copilot's pull request; **Deploy Cloud Agent
  Handover Application** automatically deploys qualifying changes pushed to
  `main`.

The Cloud Agent Handover app intentionally starts with an unfinished
`POST /api/feature`. The fixed endpoint contract is exactly:

```json
{"status":"completed","message":"The unfinished feature is now implemented."}
```

## Workflows

**Validate Scenarios** checks schema validity, lifecycle files, scenario-tool
tests, generated-catalog drift, and Bicep modules. Infrastructure capsules use
scenario-named validation and manually dispatched deployment workflows, such
as **Validate Cosmos RBAC Removal Infrastructure** and **Deploy Cosmos RBAC
Removal Infrastructure**.

Cloud Agent Handover uses **Validate Cloud Agent Handover Infrastructure**,
**Preview Cloud Agent Handover Infrastructure**, **Validate Cloud Agent
Handover Application**, and **Deploy Cloud Agent Handover Application**.
The preview workflow is manually dispatched; application deployment is
automatic on qualifying pushes to `main`.

AKS application capsules publish and deploy their own images through
scenario-named workflows. Keep the GHCR package access required by the
scenario's deployment guide; do not expose package tokens or make packages
public as a workaround.

## Documentation

- Start learners at `README.md` and a selected `scenarios/<id>/README.md`.
- Link operational guidance from the scenario capsule, not a platform
  hierarchy.
- Keep `docs/00-what-is-sre-agent.md`, `docs/01-why-sre-agent.md`, and
  `docs/02-how-it-works.md` scenario-first and consistent with the recovery
  models above.
- `docs/superpowers/**` is historical and must remain unchanged.

`CONTRIBUTING.md` defines the capsule contract. Follow its scaffold and
validation flow instead of wiring derived artifacts manually.
