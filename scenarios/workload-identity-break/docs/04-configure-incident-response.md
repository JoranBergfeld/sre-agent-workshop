# Module 4: Configure Incident Response (~20 min)

## Overview

Set up Azure Monitor as your incident platform and create a response plan so the SRE Agent automatically investigates alerts and takes action.

## Prerequisites

Reuse the subscription and workload variables established in Module 0. First
confirm that this shell is signed in to the expected subscription and can see
the scenario resource group.

**Bash** — run this in the Bash terminal where `SUBSCRIPTION_ID`,
`WORKLOAD_NAME`, and `RESOURCE_GROUP` are already set:

```bash
az login
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
az group show --name "$RESOURCE_GROUP" \
  --query '{resourceGroup:name,location:location}' --output table
```

Expected outcome: the account table shows `$SUBSCRIPTION_ID`, and the resource
group table shows `$RESOURCE_GROUP`.

**PowerShell** — run this in the PowerShell terminal where `$WorkloadName` and
`$ResourceGroup` are already set. Set `$SubscriptionId` to the same
subscription selected in Module 0:

```powershell
$SubscriptionId = "<subscription-id>"
az login
az account set --subscription $SubscriptionId
az account show --query "{name:name,id:id}" --output table
az group show --name $ResourceGroup `
  --query "{resourceGroup:name,location:location}" --output table
```

Expected outcome: the account table shows `$SubscriptionId`, and the resource
group table shows `$ResourceGroup`.

Finally, in the SRE Agent portal open **Set up your agent** → **Full setup** →
**Azure Resources**. Confirm that `$RESOURCE_GROUP` is present and reports
**permissions complete** after you reviewed the **Reader** grant. The portal
manages the agent identity and its grant; do not search for an agent identity
inside the scenario resource group.

Reader level includes **Reader**, **Log Analytics Reader**, and **Monitoring
Reader** at resource-group scope and **Monitoring Contributor** at subscription
scope. If alerts do not appear, verify the subscription-scope assignment:

1. In the agent portal, open **Settings → Azure settings → Go to Identity**.
2. In the Azure portal, copy the managed identity's **Object (principal) ID**.
3. Run the matching read-only command. These commands are verification only;
   do not create role assignments from this troubleshooting step.

**Bash**

```bash
AGENT_PRINCIPAL_ID="<object-principal-id>"
az role assignment list --assignee "$AGENT_PRINCIPAL_ID" --scope "/subscriptions/$SUBSCRIPTION_ID" \
  --query "[?roleDefinitionName=='Monitoring Contributor'].{role:roleDefinitionName,scope:scope}" \
  --output table
```

**PowerShell**

```powershell
$AgentPrincipalId = "<object-principal-id>"
az role assignment list --assignee $AgentPrincipalId --scope "/subscriptions/$SubscriptionId" `
  --query "[?roleDefinitionName=='Monitoring Contributor'].{role:roleDefinitionName,scope:scope}" `
  --output table
```

Expected outcome: the table shows **Monitoring Contributor** at subscription
scope. If it does not, return to **Full setup → Azure Resources**, review all
requested grants, and have an Owner or User Access Administrator correct the
setup through the portal.

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

> **⚠️ If alerts aren't being detected later (in Module 5):** Return to **Full
> setup** → **Azure Resources** and confirm `$RESOURCE_GROUP` still reports
> **permissions complete**. Then repeat the read-only identity check above and
> verify **Monitoring Contributor** at subscription scope.

## Create the Scenario Custom Agent

Response plans require a configured custom agent. Create one specifically for
this capsule before creating its response plan:

1. Open **Builder -> Agent Canvas**.
2. Select **Create -> Custom Agent**.
3. Set **Name** to `workload-identity-investigator`.
4. In **Instructions**, enter:

   > Investigate the workload identity authentication incident. Correlate the
   > exact failure evidence—`AADSTS70021`, `No matching federated identity`,
   > token-acquisition failures, and `/items` HTTP 500 responses while
   > `/health` remains healthy—with connected Azure resources and logs,
   > indexed repository source, and GitHub history. Identify whether the
   > federated identity credential was removed or misconfigured. Never
   > directly change Azure resources or repository code. Propose only the
   > governed recovery route: after human approval, create one issue for
   > Copilot to produce a pull request; require human review and merge,
   > followed by manual deployment.

5. Set **Handoff Description** to `Investigate the workload identity authentication incident`.
6. Under **Knowledge**, enable the already indexed
   `scenarios/workload-identity-break/knowledge/operational-guidelines.md` file
   source.
7. Under **Tools**, select the read/investigation operations needed for
   connected Azure resources and logs, repository source, and GitHub history,
   plus the GitHub issue-creation operation needed for the approved handoff.
   Do not select or grant operations for pull request creation, merge,
   workflow dispatch, deployment, or Azure modification operations.
8. Save the custom agent.
9. Return to **Builder -> Agent Canvas**, switch to **Table view**, and verify
   that `workload-identity-investigator` appears before continuing.

## Create the Scenario Response Plan

This response plan targets only this capsule's **Workload Identity Auth
Errors** alert. It sends that alert to the selected scenario custom agent for a
governed investigation and review flow.

If a default `quickstart` response plan exists, open **Builder -> Incident
response plans**, switch to **Table view**, and delete it so the same alert is
not routed twice.

1. Open **Builder -> Agent Canvas**.
2. Select **Create**, then **Trigger -> Incident response plan**.
3. Name the plan `workload-identity-break-review`.
4. Select custom agent `workload-identity-investigator`.
5. Set **Severity** to **Sev3**.
6. Set **Title contains** to `Workload Identity Auth Errors`.
7. Set **Agent autonomy level** to **Review**.
8. Keep **Reinvestigation cooldown** enabled at the default three hours.
9. Select **Next**, review the incident preview, then select **Create**.
10. In the response-plan grid, confirm the plan is **On** and shows custom
    agent `workload-identity-investigator`, **Sev3** severity, the exact
    **Workload Identity Auth Errors** title filter, and **Review** autonomy.
11. Reopen the saved plan in its edit view and confirm that the
    **Reinvestigation cooldown** remains enabled at three hours. Cooldown is
    not a response-plan grid column.

With **Review** autonomy, the SRE Agent investigates and proposes remediation.
After a human approves issue creation, the SRE Agent creates one issue assigned
to `@copilot`. Copilot creates the pull request, a human reviews and merges it,
and an operator manually deploys the approved change.

## Verify This Scenario's Alert Rule

This capsule's `infra/bicep/main.bicep` directly deploys this scenario's
`modules/alert.bicep`. Its manifest names the alert
**`workload-identity-auth-errors`**. It is a **log-based (scheduled query)
alert** over the Log Analytics workspace, not a metric alert.

```bash
# List scheduled query rules in the resource group
az resource list \
   --resource-group "$RESOURCE_GROUP" \
  --resource-type "Microsoft.Insights/scheduledQueryRules" \
  --query "[].name" -o tsv
```

Look for **`<workload>-workload-identity-auth-errors`** (for example,
`srelabidentity-workload-identity-auth-errors` with the default workload),
whose display name is **Workload Identity Auth Errors**. It queries
`ContainerLog` for `AADSTS70021` and `No matching federated identity`
token-acquisition failures.

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
remediation, a human approves issue creation. The SRE Agent creates exactly one
GitHub issue assigned to `@copilot`; a human reviews and merges the resulting
PR, then an operator manually runs the matching deployment workflow. Do not
remediate directly in Azure.

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
