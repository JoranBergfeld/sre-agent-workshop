# Module 4: Configure Incident Response (~20 min)

## Overview

Set up Azure Monitor as your incident platform and create a response plan so the SRE Agent automatically investigates alerts and takes action.

## Prerequisites

Before configuring incident response, ensure the SRE Agent's managed identity has the required RBAC roles. The agent needs **Reader** access to see your alerts. If you created the SRE Agent through the portal with the recommended setup, these roles are typically already assigned.

You can verify with:

```bash
# Find the agent's managed identity
AGENT_UAMI=$(az resource list --resource-group rg-srelabapp \
  --resource-type "Microsoft.ManagedIdentity/userAssignedIdentities" \
  --query "[?contains(name, 'agent')].name" -o tsv)

# List its role assignments
PRINCIPAL_ID=$(az identity show --name "$AGENT_UAMI" --resource-group rg-srelabapp --query principalId -o tsv)
az role assignment list --assignee "$PRINCIPAL_ID" --all \
  --query "[].{role:roleDefinitionName, scope:scope}" -o table
```

Look for **Reader** and **Monitoring Contributor** on `rg-srelabapp`. If missing, the SRE Agent portal will tell you what to grant when you connect Azure Monitor.

## Connect Azure Monitor

The SRE Agent can respond to incidents from multiple sources (Azure Monitor, PagerDuty, custom webhooks, etc.). For this workshop, we'll use Azure Monitor — the native Azure alerting platform that's already collecting metrics from your App Service.

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
- Some historical alerts from your App Service which may be generated during deployment, this shows your rule will match real incidents

Click **Next** to continue

### Step 3: Save and Set Autonomy

This step is important — it controls how much the agent is allowed to do automatically.

- **Agent autonomy level:** Select **Autonomous**

| Autonomy Level | Behavior | Best For |
|---|---|---|
| **Review** | Agent investigates, identifies root cause, proposes fixes, and waits for human approval before taking action | Production systems, high-risk changes |
| **Autonomous** | Agent investigates, identifies root cause, and automatically takes approved actions (like opening PRs) without waiting for approval | Non-production, trusted automation, this workshop |

For the workshop, **Autonomous** is perfect. It lets you watch the agent work end-to-end without needing to approve each step. In production, you'd typically start with **Review** mode for 2-4 weeks while you build confidence in the agent's decision-making. Once you're approving the same types of fixes repeatedly, you can graduate to Autonomous for those specific scenarios.

Click **Save**

You should now see your incident response plan listed in the **Incident response plans** section.

## Verify Alert Rules Exist

On this track there are **no base alerts** — every alert is contributed by a Break It scenario and wired automatically through the generated aggregator when you deploy the infrastructure. These are **log-based (scheduled query) alerts** that query Application Insights — not metric-based alerts.

```bash
# List scheduled query rules in the resource group
az resource list \
  --resource-group rg-srelabapp \
  --resource-type "Microsoft.Insights/scheduledQueryRules" \
  --query "[].name" -o tsv
```

You'll see **one alert per scenario**, each querying the Application Insights `AppRequests` table. For example, `canary-bad-release` adds `srelabapp-canary-5xx` and `red-button-500` adds `srelabapp-redbutton-5xx`. The always-current list of scenarios lives in the [Scenarios catalog](../README.md#scenarios) — each scenario contributes its own alert.

> **Why log-based alerts?** These alerts query the Application Insights `AppRequests` table via `Microsoft.Insights/scheduledQueryRules`, so they fire on real HTTP 5xx responses regardless of how the app logs internally — the standard approach for request-level alerting on App Service.

If the list is empty, re-run the **Deploy App Service Infrastructure** workflow from Module 1 — scenario alerts are generated into `workshops/appservice/infra/bicep/modules/scenario-alerts.bicep` and deployed with the infrastructure.

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

For example, when you run the `red-button-500` scenario in Module 5, clicking the red button makes the app return HTTP 500s and Azure Monitor detects the spike. The SRE Agent picks up the alert, queries the app's logs and request telemetry to pinpoint the failing endpoint, and drives the fix through this track's GitHub flow (issue → PR → deploy).

## What Happens Next

In **Module 5: Break It**, you'll intentionally inject a fault, then watch the SRE Agent detect and diagnose it. Each Break It scenario is self-contained — pick one from the [Scenarios catalog](../README.md#scenarios) and follow its README (inject → validate → let the agent remediate → clean up).

As an example, the [`red-button-500`](../scenarios/red-button-500/README.md) scenario serves a minimal two-button page whose red button triggers an HTTP 500. When you inject it:

1. Clicking the red button makes the app return HTTP 500 errors
2. Azure Monitor will detect the error spike
3. The SRE Agent will pick up the alert and begin investigating
4. In **Module 6: Watch SRE Agent**, you'll observe the agent's investigation in real time

Now that incident response is configured, you're ready to introduce the fault.

## Next Step

→ **Module 5: Break It** — choose a scenario from the [Scenarios catalog](../README.md#scenarios) and follow its README to inject the fault, then return here. New to the workshop? Start with [`red-button-500`](../scenarios/red-button-500/README.md) — a minimal two-button page whose red button triggers an HTTP 500, the fastest way to see the agent work end-to-end.
