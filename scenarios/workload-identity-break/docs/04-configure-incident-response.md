# Module 4: Configure Incident Response (~20 min)

## Overview

Set up Azure Monitor as your incident platform and create a response plan so the SRE Agent automatically investigates alerts and takes action.

## Prerequisites

Before configuring incident response, ensure the SRE Agent's managed identity has the required RBAC roles. The agent needs **Reader** access to see your alerts. If you created the SRE Agent through the portal with the recommended setup, these roles are typically already assigned.

You can verify with:

```bash
# Find the agent's managed identity
AGENT_UAMI=$(az resource list --resource-group rg-srelabidentity \
  --resource-type "Microsoft.ManagedIdentity/userAssignedIdentities" \
  --query "[?contains(name, 'agent')].name" -o tsv)

# List its role assignments
PRINCIPAL_ID=$(az identity show --name "$AGENT_UAMI" --resource-group rg-srelabidentity --query principalId -o tsv)
az role assignment list --assignee "$PRINCIPAL_ID" --all \
  --query "[].{role:roleDefinitionName, scope:scope}" -o table
```

Look for **Reader** and **Monitoring Contributor** on `rg-srelabidentity`. If missing, the SRE Agent portal will tell you what to grant when you connect Azure Monitor.

## Connect Azure Monitor

The SRE Agent can respond to incidents from multiple sources (Azure Monitor, PagerDuty, custom webhooks, etc.). For this workshop, we'll use Azure Monitor — the native Azure alerting platform that's already collecting metrics from your AKS cluster.

### Connect the Incident Platform

1. In the SRE Agent portal, look for **Builder** in the left sidebar
2. Click **Incident platform**
3. You'll see a dropdown showing "Not connected" or no platform selected
4. Click the dropdown and select **Azure Monitor**
5. The portal will ask if you want to enable the **Quickstart response plan** — **turn this OFF** (we'll create our own custom plan so you understand what's happening)
6. Click **Save**
7. Wait for a green checkmark or "Azure Monitor connected" confirmation

### What Just Happened

The agent has now established a connection to your Azure Monitor. The SRE Agent **does not use alert processing rules or webhooks**. Instead, it actively **polls Azure Monitor every minute** using its managed identity to detect new fired alerts. When it finds one, it:

1. **Acknowledges** the alert (to prevent duplicate investigations)
2. **Creates** an investigation thread with the full alert context
3. **Merges** recurring alerts from the same alert rule into a single thread

This zero-credential polling model means there's nothing extra to configure — no action groups, no webhooks, no alert processing rules.

### Verify the Connection

After connecting, verify that the SRE Agent can see your resources: Confirm that **Builder -> Incident Platform** shows "Azure Monitor" as connected

> **⚠️ If alerts aren't being detected later (in Module 5):** Verify the agent's managed identity has **Reader** + **Monitoring Contributor** roles (see Prerequisites above).

## Create an Incident Response Plan

An incident response plan tells the agent *which* alerts to respond to and *how* to respond (investigate only, or investigate + remediate).

### Start the Wizard

- In the SRE Agent portal, navigate to **Builder** → **Incident response plans** 
- Click **New incident response plan**

### Step 1: Set Up Filters

The filter defines which alerts trigger this plan.

- **Name:** Enter `workshop-all-incidents`
- **Severity:** Select **All severity levels**

In a production environment, you might create separate plans for Critical, Warning, and Info alerts with different response strategies. For this workshop, we want to catch *everything* so you can observe the agent in action.

Click **Next**

### Step 2: Preview Matching Incidents

The wizard shows you past incidents that would have matched this plan. You might see:
- No previous incidents (if this is your first time setting up monitoring), this is fine
- Some historical alerts from your AKS cluster which may be generated during deployment, this shows your rule will match real incidents

Click **Next** to continue

### Step 3: Save and Set Review Mode

This step is important — it controls how much the agent is allowed to do automatically.

- **Agent autonomy level:** Select **Review**

| Autonomy Level | Behavior | Best For |
|---|---|---|
| **Review** | Agent investigates, identifies root cause, proposes fixes, and waits for human approval before taking action | This workshop's required issue → Copilot PR → merge flow |
| **Autonomous** | Not used in this workshop; it would skip the required human approval gate. | Avoid for this scenario |

For the workshop, use **Review** mode. The SRE Agent investigates and proposes
remediation; a human creates or approves one issue assigned to `@copilot`,
reviews and merges the Copilot PR, then manually runs the deployment.

Click **Save**

You should now see your incident response plan listed in the **Incident response plans** section.

## Verify This Scenario's Alert Rule

This capsule's `infra/bicep/main.bicep` directly deploys this scenario's
`modules/alert.bicep`. Its manifest names the alert
**`workload-identity-auth-errors`**. It is a **log-based (scheduled query)
alert** over the Log Analytics workspace, not a metric alert.

```bash
# List scheduled query rules in the resource group
az resource list \
  --resource-group rg-srelabidentity \
  --resource-type "Microsoft.Insights/scheduledQueryRules" \
  --query "[].name" -o tsv
```

Look for **`srelabidentity-workload-identity-auth-errors`**, whose display name is
**Workload Identity Auth Errors**. It queries `ContainerLog` for
`AADSTS70021` and `No matching federated identity` token-acquisition failures.

> **Why log-based alerts?** AKS doesn't expose a native `restart_count` metric for `az monitor metrics alert`. Instead, our Bicep uses `Microsoft.Insights/scheduledQueryRules` to query the `KubePodInventory` and `ContainerLog` tables in Log Analytics — this is the standard approach for container-level alerting in AKS.

If the list is empty, re-run **Deploy Workload Identity Break Infrastructure**
from Module 1 — the alerts are defined in
`scenarios/workload-identity-break/infra/bicep/modules/alert.bicep`.

## How It All Connects

Here's the flow when something goes wrong:

```
1. Azure Monitor Alert fires (scheduled query rule triggers)
   ↓
2. SRE Agent polls Azure Monitor every ~1 minute
   ↓
3. Agent detects fired alert, acknowledges it, creates investigation thread
   ↓
4. Agent queries Azure Monitor logs & metrics (via managed identity)
   ↓
5. Agent checks deployment history & code changes (via GitHub connection)
   ↓
6. Agent correlates log errors with recent commits
   ↓
7. Agent records its evidence and diagnosis for the GitOps remediation flow
```

For example, when you run the `workload-identity-break` scenario in Module 5,
pods cannot acquire a token after the federated credential is removed, so
`/items` returns HTTP 500 while `/health` remains green. The SRE Agent finds
`AADSTS70021` / `No matching federated identity` in the logs, checks the Bicep
deployment history, and identifies the missing credential. After it proposes
remediation, a human creates or explicitly approves exactly one GitHub issue
assigned to `@copilot`, reviews and merges the resulting PR, then manually runs the
matching deployment workflow. Do not remediate directly in Azure.

## What Happens Next

In **Module 5: Break It**, you'll intentionally inject this capsule's fault,
then watch the SRE Agent detect and diagnose it. Follow the scenario
[README](../README.md) (inject → validate → use the human-approved GitOps flow
→ clean up).

The `workload-identity-break` scenario removes the federated identity credential from the Bicep template. When the change deploys:

1. The app will start failing to authenticate to CosmosDB
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.

## Next Step

→ **Module 5: Break It** — follow this scenario's [README](../README.md).
