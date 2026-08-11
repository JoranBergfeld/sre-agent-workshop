# Operational Guidelines

## Infrastructure as Code — No Direct Changes

All infrastructure changes MUST go through code. Never modify Azure resources directly via CLI, portal, or API during incident remediation.

**When the SRE Agent identifies a fix:**

1. The SRE Agent investigates the root cause and presents the supporting
   evidence and required Bicep change.
2. The SRE Agent requests explicit human approval before creating an issue.
3. After approval, the SRE Agent creates exactly **one** GitHub issue and
   assigns it to `copilot-swe-agent` (`@copilot`).
4. Copilot authors the pull request; a human reviews and merges it.
5. An operator manually deploys the change by triggering **Deploy Workload
   Identity Break Infrastructure** (deployment is intentionally manual via
   `workflow_dispatch`, not automatic on merge).

**Do NOT:**
- Run `az` CLI commands to directly create, modify, or delete Azure resources
- Use the Azure portal to make manual changes
- Apply temporary fixes outside of version control
- The SRE Agent must never create a branch or pull request, modify repository
  code or Azure resources, merge a pull request, or deploy a change

**Why:** This team follows GitOps principles. All infrastructure state is defined in Bicep templates under `scenarios/workload-identity-break/infra/bicep/`. Direct changes create drift between code and reality, making future incidents harder to diagnose. Using GitHub issues with `@copilot` ensures full traceability from incident → issue → PR → deployment.

## Resolve the Workload Prefix

The uploaded guidance uses `<workload>` as a resource-name pattern, not a
literal value. Infer the actual workload prefix from the connected Azure
resource group whose name matches `rg-<workload>` by removing the leading
`rg-`. Apply that resolved prefix to every Azure resource pattern below; the
learner does not need to edit this file.

## Architecture Overview

- **Resource group** (`rg-<workload>`): Connected Azure resource group from
  which the workload prefix is derived
- **AKS cluster** (`<workload>-aks`): Hosts the web app
- **CosmosDB** (`<workload>-cosmos-{suffix}`): NoSQL database, accessed via
  workload identity (no connection strings)
- **Managed Identity** (`<workload>-id`): UAMI with a federated credential
- **Kubernetes workload**: namespace `workload-identity-break`; Deployment and
  Kubernetes ServiceAccount `workload-identity-break-app`
- **Authentication chain**: Pod → K8s OIDC → Federated Credential → UAMI → CosmosDB RBAC role assignment

## Common Failure: Workload Identity Federation

If `/items` returns HTTP 500 while `/health` remains green and ContainerLogV2
contains `AADSTS70021` or `No matching federated identity`:
- **Root cause**: The UAMI's federated identity credential for
  `system:serviceaccount:workload-identity-break:workload-identity-break-app` is missing.
- **Where to fix**:
  `scenarios/workload-identity-break/infra/bicep/modules/identity.bicep` — the
  `federatedCredential` resource block.
- **How to fix**: After explicit human approval, the SRE Agent creates exactly
  one GitHub issue titled "Restore federated identity credential in
  identity.bicep" and assigns it to `copilot-swe-agent` (`@copilot`). A human
  reviews and merges Copilot's PR, then an operator manually runs **Deploy
  Workload Identity Break Infrastructure**.
- **Manual fallback only**: `scripts/remediate.sh` and
  `scripts/remediate.ps1` recreate the credential only when the GitOps path
  cannot be used. Do not run `az identity federated-credential create` directly.
