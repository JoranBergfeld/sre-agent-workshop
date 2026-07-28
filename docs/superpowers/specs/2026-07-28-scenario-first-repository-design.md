# Scenario-First Repository Design

- **Date:** 2026-07-28
- **Status:** Approved
- **Author:** @JoranBergfeld (with Copilot CLI)

## 1. Problem

The current learner journey has two selection layers:

1. Choose an Azure platform workshop.
2. Choose a fault scenario inside that workshop.

That hierarchy makes the platform appear to be the product even though the hands-on
incident is the experience learners want to run. It also means scenario documentation,
infrastructure, workloads, knowledge, and lifecycle scripts depend on a surrounding
`workshops/<track>/` structure.

The repository should instead present seven independent scenarios. A learner selects one
scenario and follows a complete deploy, exercise, and cleanup path without first learning
the concepts of workshops or tracks.

## 2. Goals

- Make scenarios the top-level learner-facing and repository-level unit.
- Preserve all seven existing incidents, Azure platforms, and operational controls.
- Make every scenario independently deployable and runnable.
- Keep deployable infrastructure, workloads, knowledge, and lifecycle scripts inside the
  scenario that uses them.
- Retain shared root tooling only for generic concerns such as schema validation,
  scaffolding, and catalog generation.
- Replace track indexes with one generated root scenario catalog.
- Keep contributor validation precise and automated.

## 3. Non-Goals

- Redesigning the incident behavior of any existing scenario.
- Replacing AKS, VM, App Service, Cosmos DB, IIS, or the existing application stacks.
- Weakening the VM approval gate, AKS GitOps guidance, or App Service Copilot handover.
- Introducing shared deployable platform packages that recreate tracks under another name.
- Preserving old `workshops/**` paths as a compatibility layer.

## 4. Selected Approach

Use **scenario capsules**. Each `scenarios/<id>/` folder owns the assets needed to deploy,
run, diagnose, remediate when applicable, validate, and clean up that scenario.

This deliberately accepts some duplication between scenarios on the same Azure platform.
The duplication is preferable to restoring a hidden platform layer that learners and
contributors must understand before they can use a scenario.

Generic root tooling remains shared because it defines the repository contract rather than
a deployable environment.

## 5. Target Repository Structure

```text
sre-agent-workshop/
├── README.md
├── CONTRIBUTING.md
├── docs/
│   ├── 00-what-is-sre-agent.md
│   ├── 01-why-sre-agent.md
│   ├── 02-how-it-works.md
│   └── connect-github-to-sre-agent.md
├── scenarios/
│   ├── cloud-agent-handover/
│   ├── cosmos-rbac-removal/
│   ├── workload-identity-break/
│   ├── cpu-runaway/
│   ├── disk-full/
│   ├── iis-app-pool/
│   └── vm-size-retirement/
├── schemas/
│   └── scenario.schema.json
├── scripts/
│   ├── new-scenario.sh
│   ├── validate-scenarios.sh
│   └── scenario-tools/
├── .devcontainer/
└── .github/workflows/
```

The `workshops/` directory and per-track landing pages are removed. Platform remains useful
as scenario metadata and as a filter in the catalog, but it is no longer a hierarchy.

## 6. Learner Experience

The root `README.md` is the only catalog entry point. It introduces the shared SRE Agent
concepts, then lists every scenario in a generated table.

The catalog includes:

- Scenario title and summary
- Azure platform
- Incident type
- Difficulty
- Estimated duration
- Severity
- Cost profile
- Direct link to the scenario

The quick-start flow becomes:

1. Create a repository from the template.
2. Select one scenario.
3. Complete that scenario's prerequisites and setup.
4. Inject and observe the incident.
5. Investigate and follow the scenario's controlled response path.
6. Validate recovery.
7. Run that scenario's cleanup.

No learner-facing documentation uses workshop or track selection as a prerequisite.

## 7. Scenario Capsule Contract

Each scenario follows this common shape:

```text
scenarios/<id>/
├── scenario.yaml
├── README.md
├── docs/
├── infra/
├── src/                    # when the scenario deploys an application
├── tests/                  # when applicable
├── knowledge/
└── scripts/
    ├── setup.sh
    ├── setup.ps1
    ├── inject.sh
    ├── inject.ps1
    ├── validate.sh
    ├── validate.ps1
    ├── cleanup.sh
    ├── cleanup.ps1
    └── remediate.*         # optional; one or more controlled actions
```

Scenario-specific files may extend this shape where the platform requires them, such as
Kubernetes manifests or VM approval-gate tooling. Those assets remain inside the scenario.

### 7.1 Manifest

`scenario.yaml` is the source of truth for discovery and generated documentation. It
replaces `track` with learner-facing platform metadata and explicit entry points.

Required fields:

- `id`
- `title`
- `platform`
- `summary`
- `incidentType`
- `severity`
- `difficulty`
- `estimatedMinutes`
- `costProfile`
- `guide`
- `setup`
- `inject`
- `validate`
- `cleanup`

Optional fields:

- `learningObjectives`
- `signal`
- `remediate`
- `investigation`
- `source`
- `tests`

Every script entry that supports local execution supplies both Bash and PowerShell paths.
`platform`, `incidentType`, and `costProfile` are non-empty descriptive strings;
`difficulty` remains `beginner`, `intermediate`, or `advanced`; and `severity` remains an
integer from 0 through 4. `guide` is the scenario-relative learner entry page.
`setup`, `inject`, `validate`, and `cleanup` are objects containing `bash` and
`powershell` scenario-relative paths. Optional `remediate` entries use the same script-pair
shape plus an action name and description. All referenced local paths must resolve inside
the scenario directory.

The schema does not encode a fixed set of platforms; platform is descriptive metadata so
adding a scenario on a new Azure service does not require registering a new track.

### 7.2 Infrastructure and Alerts

Each scenario has its own Bicep entry point and owns its alert resources. Scenario Bicep
references the scenario's alert module directly.

The per-track generated `scenario-alerts.bicep` aggregators are removed because there is no
longer a track-level deployment that must aggregate several faults.

### 7.3 Workflows

GitHub requires workflows to remain in `.github/workflows/`. Workflow files therefore
cannot live physically inside a scenario capsule.

Each deployment or validation workflow is scenario-qualified and targets exactly one
scenario path. Shared workflow mechanics may use GitHub reusable workflows, but a scenario
must not depend on another scenario's assets. Workflow display names and path filters use
scenario names rather than track names.

The App Service handover keeps automatic deployment after qualifying changes merge to
`main`. AKS and VM infrastructure deployment remains manually initiated unless a scenario
already requires different behavior.

## 8. Existing Scenario Migration

### 8.1 App Service

`cloud-agent-handover` receives the existing:

- .NET application and tests
- App Service infrastructure
- setup and cleanup scripts
- operational guidelines
- scenario injection and validation
- OIDC deployment behavior

The resulting capsule preserves approval before issue creation, assignment to
`copilot-swe-agent`, human PR review, and automatic deployment after merge.

### 8.2 AKS

Both `cosmos-rbac-removal` and `workload-identity-break` receive an independent copy of the
AKS, Cosmos DB, workload identity, Node.js application, Kubernetes manifests, monitoring,
knowledge, deployment, and cleanup assets they require.

Each copy is pruned to its own fault injection, alert, investigation, and recovery path.
The scenarios preserve GitOps-oriented operational guidance and existing identity
assumptions.

### 8.3 VM

Each of `cpu-runaway`, `disk-full`, `iis-app-pool`, and `vm-size-retirement` receives an
independent VM/IIS environment with its own infrastructure, scenario alert, investigation
query, scripts, approval gate, and cleanup path.

The ticket requirement, explicit approval, action allow-listing, and audit logging remain
part of every VM scenario capsule. Remediation action names only need to be unique within
their scenario because no track-wide action resolver remains.

## 9. Shared Tooling

Root tooling discovers `scenarios/*/scenario.yaml`.

`scripts/new-scenario.sh` becomes:

```bash
scripts/new-scenario.sh <id> "Title" --platform <platform>
```

The scaffold creates the manifest, README, docs directory, a minimal Bicep entry point, and
Bash/PowerShell lifecycle script stubs. It does not create or register a track.

`scripts/validate-scenarios.sh --write` generates the scenario table in the root README.
There are no generated per-track indexes or alert aggregators.

`scripts/validate-scenarios.sh` checks:

- Schema validity
- Manifest ID equals folder name
- Referenced files exist inside the scenario
- Bash and PowerShell lifecycle parity
- Bash script executability
- Required docs and cleanup paths exist
- Scenario Bicep entry point and alert references are valid
- Remediation action names are unique within the scenario
- Generated root catalog is current
- Workflow paths reference existing scenario assets

Failures identify the scenario, field, and missing or invalid asset. Incomplete scenarios
are never silently omitted from generation or validation.

## 10. Documentation and Contribution Model

`CONTRIBUTING.md` documents a scenario-only flow:

1. Scaffold a scenario.
2. Complete the manifest.
3. Add deployable assets and lifecycle scripts.
4. Write the learner walkthrough.
5. Add scenario-qualified workflows where required.
6. Generate and validate.

The separate "add a track" procedure is removed. A new Azure service is introduced by
adding a scenario with a new `platform` value and all required deployable assets.

Shared concept documents remain under `docs/`. Scenario-specific prerequisites,
deployment, incident response, and cleanup guidance live inside the scenario capsule.

## 11. Migration Strategy

Migration is implemented by platform to keep changes reviewable:

1. Update the schema, discovery model, generator, validation, and root catalog contract.
2. Move and complete the App Service scenario capsule.
3. Split AKS assets into two independent scenario capsules.
4. Split VM assets into four independent scenario capsules.
5. Repath and rename workflows and dev containers.
6. Rewrite root and contributor documentation.
7. Remove generated track artifacts and the complete `workshops/` tree.

Intermediate commits may be internally transitional, but the delivered branch must not
leave broken links, stale workflows, duplicate generated catalogs, or scenarios that still
depend on `workshops/**`.

## 12. Error Handling and Edge Cases

- Duplicate scenario IDs fail validation.
- Missing Bash or PowerShell variants fail validation with the referenced manifest field.
- Paths escaping a scenario directory are rejected for deployable and lifecycle assets.
- An unknown `platform` value is accepted as metadata, but all required assets remain
  subject to the common contract.
- Scenarios without remediation remain valid when the incident intentionally requires a
  code or GitOps handover.
- Workflow checks fail when path filters, working directories, or referenced scripts point
  at removed workshop paths.
- Catalog generation fails rather than dropping a malformed scenario.

## 13. Testing and Validation

The migration is complete only when:

- Scenario-tool unit tests pass.
- `scripts/validate-scenarios.sh --write` produces no unexpected changes on a second run.
- `scripts/validate-scenarios.sh` prints `Scenario validation passed`.
- Every scenario Bicep entry point builds successfully.
- App Service application and integration tests pass.
- AKS application tests pass.
- VM approval-gate tests cover ticket, approval, action resolution, and audit behavior.
- All repository Markdown links resolve.
- Workflow path references contain no `workshops/` paths.
- A repository search finds no learner-facing workshop or track-selection instructions.

## 14. Success Criteria

- The root README presents exactly seven directly selectable scenarios.
- Each scenario can be deployed, exercised, validated, and cleaned up without another
  scenario.
- No deployable scenario asset depends on a sibling scenario.
- The `workshops/` directory no longer exists.
- Platform is metadata, not a repository hierarchy.
- Existing incident behavior and operational safety controls are preserved.
- Adding an eighth scenario requires no track registration or shared platform edit.
