# Scenario: CosmosDB RBAC Removal

> Scenario: `cosmos-rbac-removal` · AKS

Run every command below from the repository root. This capsule is directly
selectable; it provisions, breaks, and recovers its own AKS workload.

## Follow the workshop modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Publish and deploy the application](./docs/02-deploy-application.md)
4. [03 Onboard the SRE Agent](./docs/03-onboard-sre-agent.md)
5. [04 Configure incident response](./docs/04-configure-incident-response.md)

# Module 5: Break It! 💥 (~20 min)

## Overview

Time to introduce a realistic infrastructure fault. You'll remove a critical role assignment from the Bicep code that gives your app permission to access CosmosDB. When you deploy this change, the app will lose access to the database — causing 500 errors on the `/items` endpoint. This simulates a real-world scenario that operations teams encounter: a well-meaning engineer thinks they're cleaning up unused infrastructure and accidentally breaks production.

## GHCR pull prerequisite

Before running this scenario's deployment workflow, maintainers must configure the repository secret `GHCR_READ_TOKEN` with a fine-grained (or classic) PAT that has **Packages: read** access to this scenario's GHCR package. The workflow creates the `ghcr-pull` Kubernetes secret; the package does not need to be public.

## The Scenario

> _A team member is reviewing the Bicep code during a cleanup initiative. They spot a role assignment on the CosmosDB account that they think might be leftover from an old project. No one is sure if it's needed, so they remove it, commit the change, and submit a PR. The code review looks good — the Bicep is syntactically valid. The PR gets merged. The team deploys the updated infrastructure. The deployment completes successfully._
>
> _Everything looks fine. The pods are running, health checks pass. But users start complaining that items aren't loading. The app is broken, and it happened silently._

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

1. **Open** `scenarios/cosmos-rbac-removal/infra/bicep/modules/identity.bicep` in your editor
2. **Find the CosmosDB role assignment** — it's in the second half of the file. Look for this comment:
   ```bicep
   // WORKSHOP: This role assignment is critical — removing it will cause the app to fail (used in Module 5: Break It)
   ```
3. **Below that comment, you'll see the resource definition:**
   ```bicep
   resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
     name: '${cosmosDbAccountName}/${guid(cosmosAccountId, uami.id, '00000000-0000-0000-0000-000000000002')}'
     properties: {
       roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
       principalId: uami.properties.principalId
       scope: cosmosAccountId
     }
   }
   ```
4. **Delete or comment out the entire `cosmosRoleAssignment` resource block** — all 8 lines, from `resource cosmosRoleAssignment` through the closing `}`
5. **Save the file**

Your file now has the role assignment logic removed. The federated credential and the user-assigned managed identity still exist — but the UAMI no longer has permission to access CosmosDB.

## Deploy the Fault

```bash
# Stage the change
git add scenarios/cosmos-rbac-removal/infra/bicep/modules/identity.bicep

# Commit with a realistic message
git commit -m "cleanup: remove unused CosmosDB role assignment"

# Push to main (or merge if you used a branch)
git push origin main
```

When you push, the `Validate Cosmos RBAC Removal Infrastructure` workflow runs automatically — it checks Bicep syntax. But it doesn't deploy anything. To actually deploy the broken infrastructure:

1. **Go to GitHub** → your fork → **Actions** tab
2. **Select "Deploy Cosmos RBAC Removal Infrastructure"** in the left sidebar
3. **Click "Run workflow"** → choose your region and workload name → **Run workflow**
4. **Watch it complete** (~3–5 minutes)

The deployment will **succeed**. The Bicep template is valid syntactically. No errors. No warnings. Just a silent infrastructure change.

> **⚠️ Important:** Azure Resource Manager uses **incremental deployment mode** by default, which means removing a resource from the Bicep template does **not** automatically delete it in Azure — it only stops managing it. The Bicep deployment alone won't break the app. To trigger the fault after the deployment completes, run the capsule injector:

**Bash**
```bash
./scenarios/cosmos-rbac-removal/scripts/inject.sh
```

**PowerShell 7**
```powershell
./scenarios/cosmos-rbac-removal/scripts/inject.ps1
```

Pass `--resource-group` / `-ResourceGroup` if you chose a non-default workload
name. The injector deletes the live role assignment, restarts the pods, and
waits for the rollout to finish.

> **Why two steps?** This mirrors what happens in production with Bicep `complete` mode or when a team actively cleans up stale role assignments. The Bicep change removes it from the "desired state" (your code), and the CLI deletion simulates Azure catching up. When the SRE Agent investigates, it'll find the role assignment is missing from both the Bicep code *and* the live Azure environment — exactly like a real cleanup-gone-wrong scenario.

## Watch It Break

While the Pods don't restart (no code changed), the app has lost its database access. Try this:

```bash
# Health check still passes (it doesn't verify database connectivity)
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
#   "error": "Failed to connect to CosmosDB: Request is blocked because principal [...] does not have the required RBAC permissions..."
# }
```

**The app is broken.** Health checks are passing. Pods are running. But users can't get their data. The pods restarted with fresh credentials that have no CosmosDB role assignment — every request to CosmosDB is rejected with a 403.

## What's Happening Under the Hood

Here's the sequence of events:

```
1. Bicep deployment removes cosmosRoleAssignment from managed state
   ↓
2. CLI command deletes the actual role assignment from Azure
   ↓
3. Pod restart clears cached UAMI tokens
   ↓
4. App makes request to CosmosDB with fresh credentials:
   K8s OIDC token → UAMI token → CosmosDB
   ↓
5. CosmosDB receives the UAMI token but checks RBAC:
   "This identity is valid, but I don't have a role assignment for it"
   ↓
6. CosmosDB rejects the request: 403 Forbidden
   ↓
7. App catches the error and returns 500 to the client
   ↓
8. Azure Monitor detects the spike in HTTP 500 errors
   ↓
9. Alert fires → SRE Agent is triggered
```

## What Happens Next

Your Azure Monitor alert will detect the spike in failed requests. The SRE Agent, which you configured in Module 4, will:

1. **Receive the alert** from Azure Monitor
2. **Query the logs** to find the error details
3. **Check pod logs** to see the authorization failures
4. **Correlate with recent deployments** (find the Bicep change you just made)
5. **Read the Bicep code** to understand what changed
6. **Identify the root cause:** missing role assignment
7. **Propose a fix** and open a PR on your fork
8. **If you configured it for Autonomous mode,** the agent will merge the PR — you then trigger the `Deploy Cosmos RBAC Removal Infrastructure` workflow to apply the fix

You don't need to fix this yourself. **Don't troubleshoot.** Don't manually restore the role assignment. Let the SRE Agent do its job. Head to Module 6 to watch it work.

## Optional: Add More Narrative

If you're running this workshop with a group, this is a great moment for storytelling:

- **"Notice how the health checks still pass?"** — This is why comprehensive monitoring is hard. Synthetic checks (like health endpoints) aren't enough; you need deep observability into your actual business flows.
- **"In a real environment, this might have gone unnoticed for hours until customers complained."** — The SRE Agent's value: it detects these silent failures automatically.
- **"The Bicep change was valid. There were no syntax errors. The infrastructure deployed successfully."** — Infrastructure-as-code doesn't catch semantic errors, only syntax. You need observability and automation to catch these.

## Next Step

→ **[Module 6: Watch the SRE Agent Work](./docs/90-watch-sre-agent.md)**

In the next module, you'll navigate to the SRE Agent portal and observe its full investigation and remediation flow. You'll see it correlate logs, read your code, and open a PR with the fix. This is where the magic happens.

After recovery, run the capsule validator:

```bash
./scenarios/cosmos-rbac-removal/scripts/validate.sh
```

```powershell
./scenarios/cosmos-rbac-removal/scripts/validate.ps1
```

Finish with [99 Cleanup](./docs/99-cleanup.md).
