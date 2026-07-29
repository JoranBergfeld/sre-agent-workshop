# Operational Guidelines

## Infrastructure as Code — No Direct Changes

All infrastructure changes MUST go through code. Never modify Azure resources directly via CLI, portal, or API during incident remediation.

**When the SRE Agent identifies a fix:**

1. A human **creates or explicitly approves exactly one GitHub issue** describing
   the root cause, affected resources, and required Bicep change, then assigns
   it to `@copilot` (the Copilot coding agent).
2. Copilot authors the pull request; a human reviews and merges it.
3. That human manually triggers **Deploy Workload Identity Break Infrastructure**
   to apply the change (deployment is intentionally manual via
   `workflow_dispatch`, not automatic on merge).

**Do NOT:**
- Run `az` CLI commands to directly create, modify, or delete Azure resources
- Use the Azure portal to make manual changes
- Apply temporary fixes outside of version control
- Create branches or PRs yourself — delegate to `@copilot` via GitHub issues

**Why:** This team follows GitOps principles. All infrastructure state is defined in Bicep templates under `scenarios/workload-identity-break/infra/bicep/`. Direct changes create drift between code and reality, making future incidents harder to diagnose. Using GitHub issues with `@copilot` ensures full traceability from incident → issue → PR → deployment.

## Architecture Overview

- **AKS cluster** (`srelab-aks`): Hosts the web app in the `workshop` namespace
- **CosmosDB** (`srelab-cosmos-{suffix}`): NoSQL database, accessed via workload identity (no connection strings)
- **Managed Identity** (`srelab-id`): UAMI with federated credential linked to K8s ServiceAccount `workshop-app`
- **Authentication chain**: Pod → K8s OIDC → Federated Credential → UAMI → CosmosDB RBAC role assignment

## Common Failure: Workload Identity Federation

If `/items` returns HTTP 500 while `/health` remains green and ContainerLog
contains `AADSTS70021` or `No matching federated identity`:
- **Root cause**: The UAMI's federated identity credential for
  `system:serviceaccount:workshop:workshop-app` is missing.
- **Where to fix**:
  `scenarios/workload-identity-break/infra/bicep/modules/identity.bicep` — the
  `federatedCredential` resource block.
- **How to fix**: After the SRE Agent investigation, create one GitHub issue
  titled "Restore federated identity credential in identity.bicep", assign it
  to `@copilot`, review and merge the PR, then manually run **Deploy Workload
  Identity Break Infrastructure**.
- **Manual fallback only**: `scripts/remediate.sh` and
  `scripts/remediate.ps1` recreate the credential only when the GitOps path
  cannot be used. Do not run `az identity federated-credential create` directly.
