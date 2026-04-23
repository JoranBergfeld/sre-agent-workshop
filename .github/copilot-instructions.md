# Copilot Instructions — SRE Agent Workshop

## Project Overview

This is an Azure SRE Agent workshop — a hands-on tutorial where attendees deploy AKS + CosmosDB infrastructure via Bicep, deploy a Node.js web app, configure an Azure SRE Agent, then deliberately break the app (remove CosmosDB RBAC role assignment) to watch the SRE Agent detect and remediate the fault via GitHub issues and @copilot PRs.

## Architecture

- **Bicep** (`infra/bicep/`): 4 modules composed by `main.bicep` — monitoring → aks → cosmosdb → identity, plus 2 alert rules defined inline in main.bicep
- **Node.js app** (`src/app/server.js`): Express server with 3 endpoints (`/`, `/health`, `/items`). Authenticates to CosmosDB using `@azure/identity` `DefaultAzureCredential` via AKS workload identity
- **K8s manifests** (`k8s/`): namespace `workshop`, ServiceAccount `workshop-app` with UAMI annotation, Deployment with 2 replicas, LoadBalancer service
- **CI/CD** (`.github/workflows/`): `deploy-infra.yml` (Bicep), `deploy-app.yml` (K8s manifests), `publish-image.yml` (GHCR container image)

## Key Conventions

### Bicep / Infrastructure

- All resource names follow `{workloadName}-{type}` pattern (default workloadName: `srelab`)
- CosmosDB uses **NoSQL (Core) API** with `@azure/cosmos` SDK — NOT MongoDB API. Endpoint format: `https://{name}-cosmos-{suffix}.documents.azure.com:443/`
- The CosmosDB account name includes a 4-char `uniqueString` suffix for global uniqueness (e.g., `srelab-cosmos-a1b2`)
- The CosmosDB role assignment in `identity.bicep` uses inline `resourceId()` construction (not `existing` resource references) to avoid ARM deployment caching issues
- Alert rules are `Microsoft.Insights/scheduledQueryRules` (log-based), NOT metric alerts. They query `ContainerLog` (v1 schema) and `KubePodInventory` tables
- The `identity.bicep` role assignment is the **fault injection target** — Module 5 removes it to break the app

### Kubernetes

- Namespace: `workshop`, ServiceAccount: `workshop-app` — these must match the federated credential in `identity.bicep`
- The `OWNER` placeholder in `deployment.yaml` image ref is replaced by `deploy-app.yml` workflow via `sed`
- Container image is publicly available at `ghcr.io/{owner}/sre-agent-workshop/app:latest`

### Workflows

- `deploy-infra.yml` triggers on `push` to `infra/**` on main AND `workflow_dispatch` — the push trigger is critical for Module 5 fault injection
- `deploy-app.yml` triggers on `push` to `k8s/**` on main AND `workflow_dispatch`
- `publish-image.yml` triggers on `push` to `src/**` on main AND `workflow_dispatch`. Uses lowercase repo owner for GHCR tags
- All workflows use `AZURE_CREDENTIALS` secret (service principal JSON)

### Workshop Flow

The workshop's "break and fix" loop:
1. Remove `cosmosRoleAssignment` from `identity.bicep` + delete via `az cosmosdb sql role assignment delete` + restart pods
2. App returns HTTP 500 with "RBAC permissions" errors on `/items`
3. Azure Monitor alert fires (queries `ContainerLog` for error keywords)
4. SRE Agent detects alert, investigates, creates GitHub issue assigned to @copilot
5. @copilot creates branch, restores the role assignment in Bicep, opens PR
6. Merge PR → `deploy-infra.yml` triggers → role assignment restored → app recovers

### Operational Guidelines

The `docs/knowledge/operational-guidelines.md` file is uploaded to the SRE Agent as a knowledge file. It instructs the agent to never make direct Azure changes — always create GitHub issues for @copilot to fix via code.
