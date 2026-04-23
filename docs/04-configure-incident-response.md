# Module 4: Configure Incident Response (~20 min)

## Overview

Set up Azure Monitor as your incident platform and create a response plan so the SRE Agent automatically investigates alerts and takes action.

## Prerequisites

Before configuring incident response, ensure the SRE Agent's managed identity has the required RBAC roles. The agent needs **Reader** access to see your alerts. If you created the SRE Agent through the portal with the recommended setup, these roles are typically already assigned.

You can verify with:

```bash
# Find the agent's managed identity
AGENT_UAMI=$(az resource list --resource-group rg-srelab \
  --resource-type "Microsoft.ManagedIdentity/userAssignedIdentities" \
  --query "[?contains(name, 'agent')].name" -o tsv)

# List its role assignments
PRINCIPAL_ID=$(az identity show --name "$AGENT_UAMI" --resource-group rg-srelab --query principalId -o tsv)
az role assignment list --assignee "$PRINCIPAL_ID" --all \
  --query "[].{role:roleDefinitionName, scope:scope}" -o table
```

Look for **Reader** and **Monitoring Contributor** on `rg-srelab`. If missing, the SRE Agent portal will tell you what to grant when you connect Azure Monitor.

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

### Step 3: Save and Set Autonomy

This step is important — it controls how much the agent is allowed to do automatically.

- **Agent autonomy level:** Select **Autonomous**

| Autonomy Level | Behavior | Best For |
|---|---|---|
| **Review** | Agent investigates, identifies root cause, proposes fixes, and waits for human approval before taking action | Production systems, high-risk changes |
| **Autonomous** | Agent investigates, identifies root cause, and automatically takes approved actions (like opening PRs or restarting pods) without waiting for approval | Non-production, trusted automation, this workshop |

For the workshop, **Autonomous** is perfect. It lets you watch the agent work end-to-end without needing to approve each step. In production, you'd typically start with **Review** mode for 2-4 weeks while you build confidence in the agent's decision-making. Once you're approving the same types of fixes repeatedly, you can graduate to Autonomous for those specific scenarios.

Click **Save**

You should now see your incident response plan listed in the **Incident response plans** section.

## Verify Alert Rules Exist

Your AKS cluster should already have alert rules from the Bicep deployment in Module 1. These are **log-based (scheduled query) alerts** that query the Log Analytics workspace — not metric-based alerts.

```bash
# List scheduled query rules in the resource group
az resource list \
  --resource-group rg-srelab \
  --resource-type "Microsoft.Insights/scheduledQueryRules" \
  --query "[].name" -o tsv
```

You should see two alert rules:
- **`srelab-container-restarts`** — fires when any container restarts more than 3 times in 5 minutes (queries `KubePodInventory`)
- **`srelab-http-500-errors`** — fires when the app returns repeated HTTP 500 errors (queries `ContainerLog`)

> **Why log-based alerts?** AKS doesn't expose a native `restart_count` metric for `az monitor metrics alert`. Instead, our Bicep uses `Microsoft.Insights/scheduledQueryRules` to query the `KubePodInventory` and `ContainerLog` tables in Log Analytics — this is the standard approach for container-level alerting in AKS.

If the list is empty, re-run the **Deploy Infrastructure** workflow from Module 1 — the alerts are defined in `infra/bicep/main.bicep`.

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
7. Agent proposes fix OR executes fix (based on autonomy level)
```

In your case, when the app starts failing in Module 5, Azure Monitor will detect the spike in errors. The SRE Agent will pick up the alert, query the app's logs, see authentication failures, check the Bicep deployment history, find the removed role assignment, and either propose or automatically open a PR to restore it.

## What Happens Next

In **Module 5: Break It**, we'll intentionally introduce a fault by editing the Bicep template to remove the CosmosDB role assignment. When the change deploys:

1. The app will start failing to authenticate to CosmosDB
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.

## Next Step

→ [Module 5: Break It](./05-break-it.md)
