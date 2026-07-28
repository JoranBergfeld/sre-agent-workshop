# Design: Minimal SRE Agent to Copilot Cloud Agent Handover

## Summary

Refactor the existing App Service track into the repository's default quickstart: a minimal
end-to-end demonstration in which a learner deploys a small Blazor application, clicks an unfinished
feature that returns HTTP 500, watches the Azure SRE Agent investigate the incident, approves creation
of a GitHub issue assigned to Copilot, reviews the resulting Cloud Agent pull request, and merges it.
The merge automatically deploys the fixed application through GitHub Actions using Azure workload
identity federation.

The repository remains multi-track and retains the AKS and VM workshops. The App Service track becomes
the simplest entry point, and the GitHub repository is marked as a template so learners create an
independent repository rather than a fork.

## Goals

- Demonstrate the value of combining the Azure SRE Agent and GitHub Copilot Cloud Agent.
- Minimize the time and Azure resources required before the learner reaches the incident.
- Make the handoff explicit: investigate, request human approval, create an issue, assign Copilot,
  review a PR, merge, deploy, and observe recovery.
- Keep the application fix small enough for one focused Cloud Agent task.
- Use secretless GitHub Actions authentication configured for each learner's Azure tenant and
  generated repository.
- Preserve the repository's scenario framework and the AKS and VM tracks.

## Non-goals

- Preserve the current App Service shop, Azure SQL dependency, deployment slots, or canary scenario.
- Add an operational kill-switch or manual runtime remediation path.
- Let the SRE Agent edit code, change Azure resources, or merge a pull request directly.
- Automatically approve issue creation or pull request merging.
- Create a separate repository for the minimal experience.

## Architecture

### Repository structure

The App Service track remains under `scenarios/cloud-agent-handover/` and continues to use the shared scenario
manifest, validation, generated scenario index, and generated alert aggregator. Its current
shop/SQL/canary implementation is replaced with a single-purpose handover workshop.

The AKS and VM tracks remain unchanged. The root README promotes App Service as the default quickstart
and continues to link to the other tracks.

### Azure resources

The App Service track deploys only:

- Resource group.
- Linux App Service Plan.
- Linux Web App for the .NET application.
- Log Analytics workspace.
- Application Insights connected to the workspace.
- Azure Monitor scheduled-query alert for the unfinished endpoint's HTTP 500 responses.
- Existing SRE Agent incident-response integration resources required by the workshop.
- User-assigned managed identity used only by the GitHub Actions deployment workflow.
- Federated identity credential bound to the learner's repository and `main` branch.

Azure SQL, database grants, deployment slots, and canary-specific resources are removed.

### Application

The application is a small .NET Blazor Web App with:

- A single learner-facing page.
- A healthy `/health` endpoint that always returns HTTP 200.
- A prominent **Run unfinished feature** button.
- A `POST /api/feature` minimal API endpoint.
- Application Insights telemetry.

The committed `/api/feature` handler contains an explicit `TODO` and throws
`NotImplementedException`. ASP.NET Core returns HTTP 500 and records request, trace, and exception
telemetry. The missing implementation is visible in the connected GitHub repository, making the root
cause deterministic for both agents and learners.

The page sends one visible request and a small sequential burst of additional requests to the same
endpoint. It displays only the first response. One click therefore looks like one failed user action
while reliably exceeding the Azure Monitor alert threshold.

## Learner flow

1. The learner selects **Use this template** and creates an independent GitHub repository.
2. The learner clones the generated repository.
3. The learner authenticates with Azure CLI and GitHub CLI.
4. The learner runs the App Service setup script in Bash or PowerShell.
5. The script deploys the infrastructure and initial application.
6. The script configures the deployment managed identity, federated credential, role assignment, and
   GitHub repository variables.
7. The learner connects the generated repository to the SRE Agent Code integration.
8. The learner configures the GitHub connector and incident-response instructions.
9. The learner opens the application and clicks **Run unfinished feature**.
10. The endpoint returns HTTP 500 and the generated request burst triggers the alert.
11. The SRE Agent investigates telemetry and source code, then presents its diagnosis.
12. The SRE Agent asks the learner for approval to create a GitHub issue.
13. After approval, the SRE Agent creates the issue and assigns it to Copilot.
14. The Copilot Cloud Agent implements the endpoint, updates tests, and opens a pull request.
15. The learner reviews and merges the pull request.
16. A push-to-`main` GitHub Actions workflow deploys the fixed application through OIDC.
17. `/api/feature` returns HTTP 200, the page shows the result, the alert clears, and the incident can
    close.

## SRE Agent handoff contract

The App Service track includes an operational-guidance knowledge file with these rules:

- Investigate the Azure Monitor alert before proposing remediation.
- Correlate the failing route with Application Insights telemetry and the connected repository.
- Do not change Azure resources or repository code directly.
- Present the diagnosis and ask for explicit learner approval before creating an issue.
- After approval, create one focused GitHub issue and assign it to Copilot.
- Do not merge the resulting pull request.

The issue should include:

- The affected route and observed HTTP status.
- Relevant request and exception telemetry.
- The source file and unimplemented handler.
- The expected response contract used by the Blazor page.
- Acceptance criteria.

Acceptance criteria:

- Implement `POST /api/feature`.
- Return HTTP 200 with:

  ```json
  {
    "status": "completed",
    "message": "The unfinished feature is now implemented."
  }
  ```

- Preserve `/health`.
- Replace the test for the intentionally broken behavior with tests for the implemented contract.
- Keep the change code-only; do not modify infrastructure.

The Blazor page displays the returned `message`. This deterministic contract keeps the task small
enough for one focused Cloud Agent pull request.

## Deployment and identity

### Initial deployment

The learner uses local Bash or PowerShell setup scripts rather than a GitHub Actions workflow for the
first deployment. The scripts:

- Check required CLI versions and authentication.
- Resolve the current GitHub repository with `gh`.
- Confirm the learner is not attempting to configure the upstream template repository.
- Select or confirm the Azure subscription and region.
- Deploy Bicep infrastructure.
- Build and deploy the initial Blazor application.
- Create or reuse a user-assigned managed identity for GitHub Actions.
- Add a federated credential restricted to the generated repository's `main` branch.
- Grant the identity only the permissions required at the workshop resource-group scope.
- Write client ID, tenant ID, subscription ID, resource group, and web app name as non-secret GitHub
  repository variables.

The setup is idempotent and surfaces failures rather than silently skipping partial configuration.

### Post-merge deployment

A workflow triggered by pushes to `main`:

- Uses `azure/login` with the configured client, tenant, and subscription variables.
- Builds and tests the App Service application.
- Deploys only the application to the existing Web App.
- Uses no long-lived Azure credential or publish-profile secret.

The workflow is copied into every repository created from the template. Each learner's setup script
creates the repository-specific OIDC trust and variables.

## Alert and investigation

The scenario alert queries Application Insights request telemetry for failures on `/api/feature`.
The threshold is low enough for one button-generated burst to trigger reliably, while filtering on the
specific route to avoid unrelated failures.

The scenario investigation query should show:

- Failed `/api/feature` requests over the recent window.
- Result codes and failure count.
- The associated `NotImplementedException` or trace.
- The operation/request identifiers needed to correlate requests and exceptions.

The alert remains a generated scenario module with the framework-required parameters and
`scopes: [scopeResourceId]`.

## Scenario framework changes

The existing `red-button-500` scenario is replaced by `cloud-agent-handover`. Its manifest describes:

- App Service track.
- Beginner difficulty.
- Alert-driven detection.
- Bash and PowerShell injection/setup validation where required by the scenario contract.
- No `remediate` action, because the Cloud Agent pull request is the only intended recovery path.
- Investigation query and attendee README.

The `canary-bad-release` scenario is removed with its App Service slot and SQL dependencies. Generated
scenario indexes, README tables, and alert aggregators are regenerated through the existing tooling.

The learner-facing title is **SRE Agent to Copilot Handover**.

## Template repository behavior

Repository content changes:

- Root README starts with the minimal App Service quickstart.
- Instructions use **Use this template**, not **Fork**.
- Setup scripts detect the generated repository automatically.
- Prerequisites explain SRE Agent access, GitHub connector access, GitHub Copilot coding-agent access,
  Azure permissions, `az`, and `gh`.
- AKS and VM remain available as advanced tracks.

Repository administration change:

- Enable the GitHub **Template repository** setting on the upstream repository.

The template setting is not representable in committed files, so it is a one-time repository-owner
action performed alongside the content changes.

## Error handling and safeguards

Setup must fail with actionable messages when:

- Azure CLI or GitHub CLI is missing or unauthenticated.
- No writable GitHub repository can be resolved.
- The repository is the upstream template rather than a generated learner repository.
- The learner lacks Azure subscription or role-assignment permissions.
- Required Azure resource providers cannot be registered.
- GitHub Actions variables or federated credentials cannot be configured.
- Copilot coding agent or issue assignment is unavailable for the repository.

The scripts must not print or persist credentials. Re-running setup should converge on the desired
configuration without creating duplicate identities, credentials, role assignments, or resources.

The deployment identity and federated credential live in the workshop resource group. Cleanup removes
that resource group and all Azure resources created by setup.

## Testing and validation

The initial repository remains green before the incident:

- `/health` test expects HTTP 200.
- `/api/feature` test documents the intentionally shipped HTTP 500 behavior.
- Blazor page rendering test confirms the button and expected client contract.
- Application build and tests pass.

The Cloud Agent issue requires replacing the broken-behavior test with tests for the implemented HTTP
200 JSON contract.

Repository validation includes:

- `scripts/validate-scenarios.sh --write`.
- `scripts/validate-scenarios.sh` with no generated drift.
- Scenario tooling unit tests.
- Bicep compilation for the App Service infrastructure, scenario alert, and generated aggregator.
- .NET restore, build, and tests.
- Bash and PowerShell script presence and executable Bash files.
- GitHub Actions workflow syntax and referenced variable names.
- Manual end-to-end validation of setup, button burst, alert, approval, issue assignment, Cloud Agent
  pull request, merge deployment, and alert recovery.

## Documentation

The App Service track should use a short linear walkthrough:

1. Prerequisites and template creation.
2. Local setup and initial deployment.
3. SRE Agent Code and GitHub connector configuration.
4. Trigger the unfinished feature.
5. Watch the investigation and approve the issue.
6. Review and merge the Cloud Agent pull request.
7. Observe deployment and recovery.
8. Cleanup.

Documentation must describe observed product behavior conservatively and avoid promising exact alert
or agent timing.

## Success criteria

- A new learner can create a repository from the template and reach the running application without
  provisioning a database or cluster.
- One button click reliably creates enough route-specific failures to trigger the configured alert.
- The SRE Agent identifies the committed missing implementation from telemetry and source code.
- The learner explicitly approves issue creation.
- The issue is assigned to Copilot and produces a focused implementation pull request.
- Merging the pull request automatically deploys the fix without an Azure secret.
- The endpoint recovers to HTTP 200 and the alert clears.
- AKS and VM tracks continue to validate and remain usable.
