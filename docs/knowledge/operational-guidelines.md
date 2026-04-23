# Operational Guidelines

## Infrastructure as Code — No Direct Changes

All infrastructure changes MUST go through code. Never modify Azure resources directly via CLI, portal, or API during incident remediation.

**When you identify a fix:**

1. **Create a GitHub issue** describing the root cause, affected resources, and the required Bicep change
2. **Assign the issue to `@copilot`** (the Copilot coding agent) — it will pick up the issue, create a branch, make the fix, and open a PR automatically
3. The CI/CD pipeline (`deploy-infra.yml`) will deploy the change automatically after merge

**Do NOT:**
- Run `az` CLI commands to directly create, modify, or delete Azure resources
- Use the Azure portal to make manual changes
- Apply temporary fixes outside of version control
- Create branches or PRs yourself — delegate to `@copilot` via GitHub issues

**Why:** This team follows GitOps principles. All infrastructure state is defined in Bicep templates under `infra/bicep/`. Direct changes create drift between code and reality, making future incidents harder to diagnose. Using GitHub issues with `@copilot` ensures full traceability from incident → issue → PR → deployment.

## Architecture Overview

- **AKS cluster** (`srelab-aks`): Hosts the web app in the `workshop` namespace
- **CosmosDB** (`srelab-cosmos-{suffix}`): NoSQL database, accessed via workload identity (no connection strings)
- **Managed Identity** (`srelab-id`): UAMI with federated credential linked to K8s ServiceAccount `workshop-app`
- **Authentication chain**: Pod → K8s OIDC → Federated Credential → UAMI → CosmosDB RBAC role assignment

## Common Failure: CosmosDB RBAC

If the app returns HTTP 500 with "RBAC permissions" errors on `/items`:
- **Root cause**: The CosmosDB SQL role assignment for the UAMI is missing
- **Where to fix**: `infra/bicep/modules/identity.bicep` — the `cosmosRoleAssignment` resource block
- **How to fix**: Create a GitHub issue with the title "Restore CosmosDB role assignment in identity.bicep" and assign it to `@copilot`
- **Do NOT** run `az cosmosdb sql role assignment create` directly
