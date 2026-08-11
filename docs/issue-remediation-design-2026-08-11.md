# GitHub Issue Remediation Design

Date: 2026-08-11

## Goal

Resolve the remaining current GitHub issues through one coordinated
documentation update while keeping each change traceable to its issue.

## Scope

The implementation covers:

- #7: complete scenario-specific cost guidance.
- #9, #10, #12, and #16: refresh AKS setup, onboarding, connector, command,
  and verification guidance.
- #13 and #17: align AKS incident-response instructions with the current Azure
  SRE Agent portal.
- #22 and #23: make workload naming and repository-creation guidance
  consistent.

Issues #14, #15, #18, #20, #21, and #25 were closed before implementation
because the current repository already resolves or supersedes them.

## Change Groups

### 1. Scenario cost guidance

Keep `costProfile` as the catalog-level planning signal. Add discoverable cost
drivers to every scenario guide so learners understand which resources make a
scenario low, medium, or high cost. Preserve the root budget and cleanup
warnings without introducing fixed prices that become stale.

### 2. Repository and workload consistency

Replace AKS instructions that tell learners to fork the repository with the
repository-wide **Use this template** flow. Update setup, deployment, cleanup,
and GitHub references consistently.

Use the selected workload name and derived resource group in commands and
examples. Where portal instructions need an example, label the default name as
an example rather than the only supported value.

### 3. AKS setup and onboarding

Align both AKS capsules with the current setup model:

- distinguish agent-resource creation from managed-identity access;
- direct learners through the current Quickstart and Full setup surfaces;
- identify the Team onboarding thread in the Favorites sidebar;
- retain the Knowledge base file-source checkpoint;
- repair GitHub connector links and keep repository indexing separate from
  issue and pull-request operations;
- state shell, authentication, subscription, and permission prerequisites
  beside commands;
- make verification counts and expected outcomes internally consistent.

Shared guidance should live in existing shared documents where both capsules
need identical behavior. Scenario-specific resource names and checks remain in
the capsule.

### 4. Incident-response flow

Replace the stale AKS response-plan wizard with the current flow:

1. Connect Azure Monitor as the incident platform.
2. Remove the automatically created quickstart plan when a custom plan will
   replace it.
3. Open **Builder -> Agent Canvas** and create an incident response plan
   trigger.
4. Select the scenario agent, scenario-specific severity and title filter,
   and **Review** autonomy.
5. Keep the default three-hour reinvestigation cooldown.
6. Preview matches, create the plan, and verify its status and filters in the
   response-plan grid.

Each AKS capsule should target only its own alert rather than all incidents.

## Issue and Commit Mapping

Implementation will be delivered as four scoped commits:

1. Cost guidance: #7.
2. Repository and workload consistency: #22 and #23.
3. AKS setup and onboarding: #9, #10, #12, and #16.
4. Incident-response flow: #13 and #17.

Commit messages and issue comments will identify the issues addressed. Issues
will close only after their mapped changes are complete and validated.

## Validation

Run the repository-required scenario checks:

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Also search the changed AKS documentation for:

- stale fork instructions;
- broken GitHub connector anchors;
- hard-coded default resource names presented as mandatory;
- obsolete response-plan labels and save steps;
- inconsistent checklist counts.

The generated root catalog must have no drift after validation.

## Completion Criteria

- Every current issue has an explicit repository change or a documented reason
  for closure.
- Root and scenario repository-creation instructions agree.
- Both AKS capsules support their documented custom workload names.
- Current Microsoft Learn terminology and navigation are used for onboarding
  and response plans.
- Every scenario exposes its cost profile and dominant cost drivers.
- Required validation commands pass before the remaining issues are closed.
