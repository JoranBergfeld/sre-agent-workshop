# Cloud Agent Handover Local Deployment Design

## Goal

Replace the Cloud Agent Handover scenario's automatic GitHub Actions deployment
with an explicit local operator deployment after the Copilot pull request is
merged. The learner remains responsible for reviewing the change, updating
their local checkout, deploying the reviewed code, and validating recovery.

## Architecture

The scenario keeps GitHub Actions as the independent pull-request validation
gate, but removes the application deployment workflow. Azure deployment uses
the learner's authenticated Azure CLI session instead of a GitHub OIDC
identity, service principal, or publish-profile secret.

The infrastructure no longer provisions the GitHub deployment user-assigned
managed identity, federated credential, or Website Contributor role
assignment. Setup continues to provision the App Service and monitoring
resources and performs the initial local application deployment.

## Components

Add matching lifecycle helper scripts:

- `scenarios/cloud-agent-handover/scripts/deploy.sh`
- `scenarios/cloud-agent-handover/scripts/deploy.ps1`

Each script:

1. Verifies required local tools and Azure CLI authentication.
2. Selects and verifies the requested Azure subscription.
3. Resolves the App Service from the resource group unless an app name is
   supplied.
4. Runs the existing endpoint test project.
5. Publishes the application in Release configuration to a temporary directory.
6. Creates a zip archive from the published output.
7. Runs `az webapp deploy` against the resolved App Service.
8. Removes temporary files and prints the deployed application URL.

The scripts deploy exactly the current checkout. They do not fetch, switch
branches, pull, merge, reset, or otherwise mutate Git state.

## Learner Flow

After reviewing and merging the Copilot pull request, the learner:

1. Checks out their local `main` branch and pulls the merged change.
2. Runs the Bash or PowerShell deployment script.
3. Runs the existing scenario validator.
4. Confirms the exact HTTP 200 endpoint contract and healthy application.

The GitHub-only fallback still stops after review and merge when Azure
infrastructure is unavailable.

## Repository Changes

Remove `.github/workflows/deploy-appservice-app.yml`.

Remove the deployment identity module invocation and related parameter/output
from the Cloud Agent Handover Bicep entry point. Delete the now-unused identity
module.

Update setup scripts to stop reading deployment identity outputs and stop
writing `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`
repository variables. Preserve `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`,
`AZURE_LOCATION`, and `WORKLOAD_NAME` because they remain useful resource
metadata for the optional infrastructure preview and learner commands.

Update the preview workflow so its Bicep invocation no longer supplies the
removed GitHub repository parameter. The preview workflow's existing
`AZURE_CREDENTIALS` requirement remains an optional maintainer path and is not
part of the learner recovery flow.

Update the scenario manifest, README, prerequisites, setup, application,
handover, cleanup, and operational guidance to describe the local deployment
model consistently.

## Error Handling

The deployment scripts fail with actionable errors for missing tools,
unauthenticated Azure CLI sessions, subscription mismatches, missing resource
groups or web apps, failed tests, failed publication, archive errors, and Azure
deployment failures. They must not report success after a failed command.

Temporary publish output is always removed. Invalid or missing option values
return a usage error rather than being silently ignored.

## Validation

Add scenario-tool tests for the new Bash deployment helper where repository
tests already use static script assertions. Validate PowerShell syntax using
the repository's available conventions.

Run:

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Also run the Cloud Agent Handover application tests and relevant Bicep
validation through the existing repository commands.
