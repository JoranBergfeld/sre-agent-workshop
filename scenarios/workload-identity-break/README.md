# Break It: Workload Identity 💥 (~30 min)

## Overview

This scenario introduces an **authentication** fault — a different failure class from `cosmos-rbac-removal` (which is an *authorization* fault). You'll remove the **federated identity credential** that lets your pods exchange their Kubernetes ServiceAccount token for an Azure AD token. Without it, the app can't authenticate to Azure at all: every `/items` request returns HTTP 500 with an `AADSTS70021: No matching federated identity record found` error, while `/health` keeps returning 200.

> **Authn vs authz:** In `cosmos-rbac-removal` the identity was valid but lacked a *role* (authorization). Here the identity can't even obtain a *token* (authentication) — the failure happens one step earlier in the chain.

## The Scenario

> _During an identity hygiene review, an engineer is auditing user-assigned managed identities. They find a federated identity credential on `srelab-id` with an unfamiliar issuer URL and a subject referencing a Kubernetes ServiceAccount. It looks like leftover federation from an old migration. They remove the `federatedCredential` block from the Bicep, commit, and the PR merges cleanly — the template is valid. The next infrastructure deploy reconciles it away._
>
> _Pods are running. Health checks are green. But every data request now fails with a cryptic `AADSTS70021` error. The app can no longer prove who it is to Azure._

This is the scenario you're about to create — and then watch your SRE Agent detect, diagnose, and fix it.

## Verify Current State

Before you break anything, confirm the app is working:

```bash
# Set the IP again (if not already set)
export APP_IP=$(kubectl get svc web-app -n workshop -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# This should return 200
curl http://$APP_IP/items

# Expected output: [] or a list of items
```

Good? Let's break it.

## Make the Change

1. **Open** `workshops/aks/infra/bicep/modules/identity.bicep` in your editor
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
git add workshops/aks/infra/bicep/modules/identity.bicep

# Commit with a realistic message
git commit -m "identity cleanup: remove stale federated credential"

# Push to main (or merge if you used a branch)
git push origin main
```

When you push, the `Validate AKS Infrastructure` workflow runs automatically — it checks Bicep syntax and shows a what-if preview, but it doesn't deploy anything. To actually deploy the broken infrastructure:

1. **Go to GitHub** → your fork → **Actions** tab
2. **Select "Deploy AKS Infrastructure"** in the left sidebar
3. **Click "Run workflow"** → choose your region and workload name → **Run workflow**
4. **Watch it complete** (~3–5 minutes)

The deployment will **succeed**. The Bicep template is valid syntactically.

> **⚠️ Important:** Azure Resource Manager uses **incremental deployment mode** by default, so removing the federated credential from the Bicep template does **not** automatically delete it in Azure — it only stops managing it. To actually trigger the fault, delete the live credential after the deployment completes:

```bash
az identity federated-credential delete \
  --name srelab-fed-cred \
  --identity-name srelab-id \
  --resource-group rg-srelab \
  --yes
```

> **Why two steps?** This mirrors a real identity-cleanup-gone-wrong: the Bicep change removes the credential from the "desired state" (your code), and the CLI deletion simulates Azure catching up. When the SRE Agent investigates, it finds the credential missing from both the Bicep code *and* the live environment.

After deleting the credential, **restart the pods** so they attempt a fresh (now-failing) token exchange:

```bash
kubectl rollout restart deployment/web-app -n workshop
kubectl rollout status deployment/web-app -n workshop --timeout=90s
```

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
7. **Propose a fix** — restore the `federatedCredential` block — and open a PR on your fork
8. **If you configured it for Autonomous mode,** the agent merges the PR; you then trigger the `Deploy AKS Infrastructure` workflow to apply the fix

You don't need to fix this yourself. **Don't troubleshoot.** Don't manually recreate the credential. Let the SRE Agent do its job.

## Optional: Add More Narrative

If you're running this workshop with a group, this is a great moment for storytelling:

- **"Notice how the health checks still pass?"** — Liveness probes don't authenticate to Azure, so they stay green while the real business flow is dead.
- **"This is authentication, not authorization."** — The identity is fine; it just can't prove who it is. That's a different signature than a 403 RBAC denial.
- **"The Bicep change was valid. No syntax errors. The deploy succeeded."** — Infrastructure-as-code catches syntax, not intent. You need observability and automation to catch these.

## Next Step

→ **[Watch the SRE Agent Work](../../docs/90-watch-sre-agent.md)**

In the next module, you'll navigate to the SRE Agent portal and observe its full investigation and remediation flow — correlating logs, reading your code, and opening a PR that restores the federated credential.
