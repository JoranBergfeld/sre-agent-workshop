# Scenario Mandatory Flow Validation

## Purpose

Refocus **Validate Scenarios** on the repository-wide structural contract.
Every scenario must declare and document the mandatory learner flow, while
scenario-specific executable tests and infrastructure builds run independently.

## Manifest contract

Add an ordered `pages` array to `scenario.yaml`. Each entry references one
Markdown file inside the scenario capsule.

Mandatory entries use a `stage` value:

1. `prerequisites`
2. `deploy-infrastructure`
3. `onboard-sre-agent`
4. `configure-incident-response`
5. `run-observe-scenario`
6. `cleanup`

Optional entries use `optional: true` and may appear before, between, or after
mandatory entries.

Example:

```yaml
pages:
  - stage: prerequisites
    path: docs/00-prerequisites.md
  - stage: deploy-infrastructure
    path: docs/01-deploy-infrastructure.md
  - optional: true
    path: docs/02-deploy-application.md
  - stage: onboard-sre-agent
    path: docs/03-onboard-sre-agent.md
  - stage: configure-incident-response
    path: docs/04-configure-incident-response.md
  - stage: run-observe-scenario
    path: docs/90-watch-sre-agent.md
  - stage: cleanup
    path: docs/99-cleanup.md
```

Each entry must contain exactly one of `stage` or `optional: true`. Paths must
be unique, relative, remain inside the capsule, exist, and reference Markdown
files. The six mandatory stages must each occur exactly once and in canonical
order.

The existing `guide` field remains the learner entry point and continues to
reference the scenario `README.md`.

## README contract

The scenario README must link every declared page exactly once and in the same
order as the manifest. Link labels and surrounding prose remain unconstrained.
Undeclared Markdown links are allowed, but links to additional learner-flow
pages under the scenario `docs/` directory must be declared as optional pages.

This keeps the manifest authoritative while ensuring learners can follow the
declared journey from the entry point.

## Validation architecture

Extend `scripts/scenario-tools` with a focused page-flow validator used by the
existing top-level scenario validator.

The validator:

- validates the `pages` shape through `scenario.schema.json`;
- verifies page paths with the existing safe local-path mechanism;
- detects missing, duplicate, or out-of-order mandatory stages;
- detects duplicate page paths;
- parses local Markdown links from the guide;
- verifies declared pages appear exactly once and in manifest order;
- reports the scenario ID, stage or path, and specific violation.

The page-flow logic remains a pure function with filesystem and guide content
passed in, matching the current validator design.

## Workflow scope

**Validate Scenarios** retains:

- scenario-tool installation and unit tests;
- schema and cross-field validation;
- mandatory page-flow validation;
- lifecycle file and executable checks;
- generated root catalog drift detection.

It stops running:

- scenario capsule Bash, Node, PowerShell, or .NET tests;
- Bicep compilation for every scenario.

Executable capsule tests and Bicep validation belong in scenario-specific
workflows. A failure in one capsule therefore identifies and blocks that
scenario without making the repository-wide structural gate depend on an
unrelated runtime test.

## Migration

Update all seven active scenario manifests and READMEs in one change. Existing
page filenames do not need renaming; their semantic stage is declared in the
manifest. Application deployment and other scenario-specific modules become
optional entries.

The migration is complete only when every active scenario:

- declares all six mandatory stages;
- declares every learner-flow page;
- links those pages from its README in declared order;
- passes the structural validator.

## Error handling

Validation fails closed. Representative errors:

- `arc-disk-pressure pages missing mandatory stage onboard-sre-agent`
- `cpu-runaway pages stage cleanup appears before run-observe-scenario`
- `cloud-agent-handover pages path docs/02-deploy-application.md is duplicated`
- `iis-app-pool guide does not link declared page docs/04-onboard-sre-agent.md`
- `vm-size-retirement guide page order differs from scenario.yaml`

## Testing

Add unit tests for:

- the minimum valid six-stage flow;
- optional pages before, between, and after mandatory stages;
- each missing mandatory stage;
- duplicate and out-of-order mandatory stages;
- duplicate, missing, escaping, and non-Markdown paths;
- a guide with missing, duplicated, or reordered declared links;
- allowed unrelated links;
- migration validity for every active scenario.

Workflow validation confirms the structural job no longer executes capsule
tests or Bicep builds.

## Non-goals

- Enforcing page filenames or numeric prefixes.
- Enforcing headings or prose inside a page.
- Running live Azure deployments.
- Replacing scenario-specific test or infrastructure workflows.
