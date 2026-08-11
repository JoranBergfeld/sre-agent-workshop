# Scenario: Workload Identity Break

> Scenario: `workload-identity-break` · AKS

Run every command below from the repository root. This capsule is directly
selectable; it provisions, breaks, and recovers its own AKS workload.

## Follow the workshop modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Publish and deploy the application](./docs/02-deploy-application.md)
4. [03 Onboard the SRE Agent](./docs/03-onboard-sre-agent.md)
5. [04 Configure incident response](./docs/04-configure-incident-response.md)
6. [90 Watch SRE Agent](./docs/90-watch-sre-agent.md)
7. [99 Cleanup](./docs/99-cleanup.md)

## Capsule commands

Run the setup check and cleanup commands from the repository root:

```bash
export WORKLOAD_NAME="srelabidentity"
export RESOURCE_GROUP="rg-${WORKLOAD_NAME}"
export SUBSCRIPTION_ID="<subscription-id>"
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
./scenarios/workload-identity-break/scripts/setup.sh --subscription-id "$SUBSCRIPTION_ID"
./scenarios/workload-identity-break/scripts/cleanup.sh --workload "$WORKLOAD_NAME" --resource-group "$RESOURCE_GROUP"
```

```powershell
$WorkloadName = "srelabidentity"
$ResourceGroup = "rg-$WorkloadName"
$SubscriptionId = "<subscription-id>"
az account set --subscription $SubscriptionId
az account show --query '{name:name,id:id}' --output table
./scenarios/workload-identity-break/scripts/setup.ps1 -SubscriptionId $SubscriptionId
./scenarios/workload-identity-break/scripts/cleanup.ps1 -Workload $WorkloadName -ResourceGroup $ResourceGroup
```

For a custom workload, the resource group is derived when it is not explicit:

```bash
./scenarios/workload-identity-break/scripts/inject.sh --workload "$WORKLOAD_NAME"
```

```powershell
./scenarios/workload-identity-break/scripts/inject.ps1 -Workload $WorkloadName
```

# Break It: Workload Identity 💥 (~30 min)

## Overview

This scenario introduces an **authentication** fault — a different failure class from `cosmos-rbac-removal` (which is an *authorization* fault). You'll remove the **federated identity credential** that lets your pods exchange their Kubernetes ServiceAccount token for an Azure AD token. Without it, the app can't authenticate to Azure at all: every `/items` request returns HTTP 500 with an `AADSTS70021: No matching federated identity record found` error, while `/health` keeps returning 200.

> **Authn vs authz:** In `cosmos-rbac-removal` the identity was valid but lacked a *role* (authorization). Here the identity can't even obtain a *token* (authentication) — the failure happens one step earlier in the chain.

## GHCR pull prerequisite

Before running this scenario's deployment workflow, maintainers must configure the repository secret `GHCR_READ_TOKEN` with a fine-grained (or classic) PAT that has **Packages: read** access to this scenario's GHCR package. The workflow creates the `ghcr-pull` Kubernetes secret; the package does not need to be public.

## The Scenario

> _During an identity hygiene review, an engineer is auditing user-assigned managed identities. They find a federated identity credential on `srelabidentity-id` with an unfamiliar issuer URL and a subject referencing a Kubernetes ServiceAccount. It looks like leftover federation from an old migration. They remove the `federatedCredential` block from the Bicep, commit, and the PR merges cleanly — the template is valid. The next infrastructure deploy reconciles it away._
>
> _Pods are running. Health checks are green. But every data request now fails with a cryptic `AADSTS70021` error. The app can no longer prove who it is to Azure._

This is the scenario you're about to create — and then watch your SRE Agent detect, diagnose, and fix it.

## Verify Current State

Before you break anything, confirm the app is working:

```bash
# Set the IP again (if not already set)
export APP_IP=$(kubectl get svc workload-identity-break-app -n workload-identity-break -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# This should return 200
curl http://$APP_IP/items

# Expected output: [] or a list of items
```

Good? Let's break it.

## Make the Change

1. **Open** `scenarios/workload-identity-break/infra/bicep/modules/identity.bicep` in your editor
2. **Find the federated identity credential** — look for this comment block:
   ```bicep
   // ──────────────────────────────────────────────
   // Federated Identity Credential
   // Links K8s ServiceAccount → UAMI via AKS OIDC issuer
   // ──────────────────────────────────────────────
   ```
3. **Below it you'll see the resource definition:**
   ```bicep
   resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
     parent: uami
     name: '${workloadName}-fed-cred'
     properties: {
       issuer: aksOidcIssuerUrl
       subject: 'system:serviceaccount:${k8sNamespace}:${k8sServiceAccountName}'
       audiences: [
         'api://AzureADTokenExchange'
       ]
     }
   }
   ```
4. **Delete or comment out the entire `federatedCredential` resource block** — from `resource federatedCredential` through its closing `}`
5. **Save the file**

The UAMI and its CosmosDB role assignment still exist — but pods can no longer obtain a token *as* that UAMI, because the trust between the Kubernetes ServiceAccount and the identity is gone.

## Deploy the Fault

```bash
# Stage the change
git add scenarios/workload-identity-break/infra/bicep/modules/identity.bicep

# Commit with a realistic message
git commit -m "identity cleanup: remove stale federated credential"

# Push to main (or merge if you used a branch)
git push origin main
```

When you push, the `Validate Workload Identity Break Infrastructure` workflow runs automatically — it checks Bicep syntax, but it doesn't deploy anything. To actually deploy the broken infrastructure:

1. **Go to GitHub** → your fork → **Actions** tab
2. **Select "Deploy Workload Identity Break Infrastructure"** in the left sidebar
3. **Click "Run workflow"** → choose your region and workload name → **Run workflow**
4. **Watch it complete** (~3–5 minutes)

The deployment will **succeed**. The Bicep template is valid syntactically.

> **⚠️ Important:** Azure Resource Manager uses **incremental deployment mode** by default, so removing the federated credential from the Bicep template does **not** automatically delete it in Azure — it only stops managing it. To trigger the fault after the deployment completes, run the capsule injector:

**Bash**
```bash
./scenarios/workload-identity-break/scripts/inject.sh \
   --workload "$WORKLOAD_NAME" --resource-group "$RESOURCE_GROUP"
```

**PowerShell 7**
```powershell
./scenarios/workload-identity-break/scripts/inject.ps1 `
   -Workload $WorkloadName -ResourceGroup $ResourceGroup
```

The injector deletes the live federated credential, restarts the pods, and
waits for the rollout to finish.

> **Why two steps?** This mirrors a real identity-cleanup-gone-wrong: the Bicep change removes the credential from the "desired state" (your code), and the CLI deletion simulates Azure catching up. When the SRE Agent investigates, it finds the credential missing from both the Bicep code *and* the live environment.

## Watch It Break

The pods are running, but the app can no longer authenticate to Azure. Try this:

```bash
# Health check still passes (it doesn't authenticate to Azure)
curl http://$APP_IP/health

# Returns 200: {"status":"healthy","timestamp":"..."}
# Everything looks fine!
```

But now:

```bash
# The items endpoint fails
curl http://$APP_IP/items

# Returns 500 with an error message like:
# {
#   "error": "Failed to connect to CosmosDB: ... AADSTS70021: No matching federated identity record found for presented assertion ..."
# }
```

**The app is broken.** Health checks are passing. Pods are running. But the app can't authenticate to Azure, so every data request fails *before* it ever reaches CosmosDB's authorization check.

## What's Happening Under the Hood

Here's the sequence of events:

```
1. Bicep deployment removes federatedCredential from managed state
   ↓
2. CLI command deletes the actual federated credential from the UAMI
   ↓
3. Pod restart clears any cached AAD tokens
   ↓
4. App tries to authenticate: it presents its projected ServiceAccount
   (OIDC) token to Azure AD to exchange for a UAMI token
   ↓
5. Azure AD looks for a federated identity credential matching
   (issuer, subject) — and finds none
   ↓
6. Azure AD rejects the exchange: AADSTS70021
   "No matching federated identity record found"
   ↓
7. The app never gets a token — the CosmosDB call fails at the
   AUTHENTICATION step (before any RBAC/authorization check)
   ↓
8. App catches the error and returns 500 to the client
   ↓
9. Azure Monitor detects the AADSTS / token-exchange errors in container logs
   ↓
10. The "Workload Identity Auth Errors" alert fires → SRE Agent is triggered
```

> **Contrast with `cosmos-rbac-removal`:** there, the token exchange *succeeded* and CosmosDB rejected the request with a 403 (authorization). Here, the token exchange itself *fails* (authentication). The distinct alert keys (`AADSTS70021`, `No matching federated identity`) let the agent tell the two apart.

## What Happens Next

Your Azure Monitor alert detects the authentication errors. The SRE Agent, which you configured during onboarding, will:

1. **Receive the alert** from Azure Monitor
2. **Query the logs** and find the `AADSTS70021` / token-exchange errors
3. **Check pod logs** to confirm the authentication failures
4. **Correlate with recent deployments** (find the `identity.bicep` change you just made)
5. **Read the Bicep code** to understand what changed
6. **Identify the root cause:** the missing `federatedCredential`
7. **Propose remediation** and record the diagnosis and evidence for the
   missing `federatedCredential`
8. **Follow the human-approved GitOps remediation flow below** to restore the
   credential through code

## Remediate through GitOps

After the SRE Agent investigates and proposes remediation, do **not** recreate
the federated credential directly in Azure. A human creates or explicitly
approves exactly **one** GitHub issue describing the evidence and required
`federatedCredential` Bicep restoration, then assigns it to `@copilot` (the
Copilot coding agent). Copilot authors the PR; a human reviews and merges it,
then manually runs **Deploy Workload Identity Break Infrastructure** if
deployment is required.

`scripts/remediate.sh` and `scripts/remediate.ps1` are constrained manual
fallbacks only. Use them only when the normal issue → Copilot PR → review →
merge → manual deployment path cannot be used.

You don't need to fix this directly. Let the SRE Agent investigate, then
preserve the issue-to-Copilot GitOps path.

## Optional: Add More Narrative

If you're running this workshop with a group, this is a great moment for storytelling:

- **"Notice how the health checks still pass?"** — Liveness probes don't authenticate to Azure, so they stay green while the real business flow is dead.
- **"This is authentication, not authorization."** — The identity is fine; it just can't prove who it is. That's a different signature than a 403 RBAC denial.
- **"The Bicep change was valid. No syntax errors. The deploy succeeded."** — Infrastructure-as-code catches syntax, not intent. You need observability and automation to catch these.

## Next Step

→ **[Watch the SRE Agent Work](./docs/90-watch-sre-agent.md)**

In the next module, you'll see the SRE Agent correlate logs, read your code,
and propose remediation. A human then uses the single-issue GitOps flow for
Copilot to author the PR and deploys the merged fix.

After recovery, run the capsule validator:

```bash
./scenarios/workload-identity-break/scripts/validate.sh
```

```powershell
./scenarios/workload-identity-break/scripts/validate.ps1
```

Finish with [99 Cleanup](./docs/99-cleanup.md).
