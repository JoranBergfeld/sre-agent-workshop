# Module 7: Cleanup

## Overview

Congratulations! You've completed the workshop and seen the Azure SRE Agent in action. Now it's time to tear down all the resources you created so you stop incurring costs. This module walks you through deletion of Azure resources, the SRE Agent, and GitHub secrets. Estimated time: **10 minutes**.

> **Important:** Once you delete a resource, it cannot be recovered. Only proceed if you're finished experimenting with the workshop environment.

## Remove the SRE Agent Subscription Role Assignment

SRE Agent setup granted its managed identity **Monitoring Contributor** at
subscription scope. Resource-group deletion removes resources and
resource-group-scoped role assignments, but resource-group deletion does not
remove subscription-scope role assignments. Remove this exact assignment before
deleting the agent, while its principal ID is still available.

You need **Owner** or **User Access Administrator** at subscription scope to
delete this role assignment. Contributor is not sufficient.

### Capture the Agent Principal ID Before Deletion

1. In the SRE Agent portal, select the workshop agent.
2. Open **Settings** → **Azure settings** → **Go to Identity**.
3. Copy the **Object (principal) ID** before deleting the agent.

### List, Review, Delete, and Verify the Exact Assignment

Reuse the subscription variables from Module 0. Set the intended subscription,
confirm the active account, and use `/subscriptions/<subscription-id>` as the
exact cleanup scope.

**Bash**

```bash
export SUBSCRIPTION_ID="<subscription-id>"
AGENT_PRINCIPAL_ID="<object-principal-id>"
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
az role assignment list --assignee-object-id "$AGENT_PRINCIPAL_ID" --role "Monitoring Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID" --output table
```

Review the output and confirm it is the agent's **Monitoring Contributor**
assignment at the intended subscription scope. Then delete only that exact
role and scope:

```bash
az role assignment delete --assignee-object-id "$AGENT_PRINCIPAL_ID" --role "Monitoring Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID"
az role assignment list --assignee-object-id "$AGENT_PRINCIPAL_ID" --role "Monitoring Contributor" --scope "/subscriptions/$SUBSCRIPTION_ID" --output table
```

The verification list must return no matching assignment before you continue.

**PowerShell**

```powershell
$SubscriptionId = "<subscription-id>"
$AgentPrincipalId = "<object-principal-id>"
az account set --subscription $SubscriptionId
az account show --query "{name:name,id:id}" --output table
az role assignment list --assignee-object-id $AgentPrincipalId --role "Monitoring Contributor" --scope "/subscriptions/$SubscriptionId" --output table
```

Review the output and confirm it is the agent's **Monitoring Contributor**
assignment at the intended subscription scope. Then delete only that exact
role and scope:

```powershell
az role assignment delete --assignee-object-id $AgentPrincipalId --role "Monitoring Contributor" --scope "/subscriptions/$SubscriptionId"
az role assignment list --assignee-object-id $AgentPrincipalId --role "Monitoring Contributor" --scope "/subscriptions/$SubscriptionId" --output table
```

The verification list must return no matching assignment before you continue.

Do not use a broad role-assignment deletion command.

## Delete the SRE Agent

After verifying the subscription-scope assignment is gone, delete the workshop
agent.

### Via the SRE Agent Portal

1. Navigate to [sre.azure.com](https://sre.azure.com).
2. Select your agent from the list.
3. Click **Settings** (gear icon).
4. Click **Delete agent** at the bottom.
5. Confirm deletion.

### Via the Azure Portal

1. Navigate to the [Azure Portal](https://portal.azure.com).
2. Go to your resource group (or all resources).
3. Search for the SRE Agent resource by name.
4. Open the resource and select **Delete**.
5. Confirm deletion.

## Delete Azure Resources

The AKS, Cosmos DB, Log Analytics, Application Insights, managed identity, and
resource-group-scoped role assignments live in the scenario resource group.
The subscription-scoped SRE Agent assignment was removed separately above.

### Get Your Resource Group Name

When you deployed infrastructure (Module 1), you specified a resource group name. It's likely one of:
- `rg-srelabcosmos` (if you used the default)
- Check the Azure Portal: navigate to **Resource Groups** and look for the one you created

### Delete the Resource Group

Establish the same values used for deployment, confirm the subscription, and
run the capsule cleanup:

```bash
export WORKLOAD_NAME="srelabcosmos"
export RESOURCE_GROUP="rg-${WORKLOAD_NAME}"
export SUBSCRIPTION_ID="<subscription-id>"
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
./scenarios/cosmos-rbac-removal/scripts/cleanup.sh \
	--workload "$WORKLOAD_NAME" --resource-group "$RESOURCE_GROUP" --yes
```

```powershell
$WorkloadName = "srelabcosmos"
$ResourceGroup = "rg-${WorkloadName}"
$SubscriptionId = "<subscription-id>"
az account set --subscription $SubscriptionId
az account show --query '{name:name,id:id}' --output table
$env:AZURE_SUBSCRIPTION_ID = $SubscriptionId
./scenarios/cosmos-rbac-removal/scripts/cleanup.ps1 `
	-Workload $WorkloadName -ResourceGroup $ResourceGroup -Yes
```

**What this does:**
- `--yes` skips the confirmation prompt
- `--no-wait` returns immediately without waiting for deletion to complete (it runs in the background)

**To monitor deletion:**
```bash
az group show --name "$RESOURCE_GROUP"
```

This command will return an error once the resource group is deleted (which is the expected outcome).

> **Note:** Deletion typically takes 5–10 minutes. You'll stop incurring hourly charges immediately, but Azure may take a moment to fully remove the resources from billing.

## Clean Up GitHub

### Remove the Service Principal (Optional)

If you created a service principal specifically for this workshop and won't use it elsewhere, you can delete it:

```bash
az ad sp list --display-name "sre-workshop-sp" --query "[0].appId" -o tsv
```

This returns the app ID. Then delete the service principal:

```bash
az ad sp delete --id {APP_ID}
```

> **If you're unsure**, you can leave the service principal in place. It doesn't incur costs. You can always delete it later.

### Remove GitHub Actions Secrets

Your generated repository still has the `AZURE_CREDENTIALS` secret configured. If you no longer need it, remove it:

1. Go to your generated repository on GitHub.
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click the trash icon next to `AZURE_CREDENTIALS` to delete it

> **Why:** Reduces the attack surface if your generated repository is compromised. An attacker with access to these secrets could deploy resources to your subscription.

### Delete Your Generated Repository (Optional)

If you won't use the workshop repository anymore, you can delete the generated repository:

1. Go to your generated repository on GitHub.
2. Click **Settings** at the top
3. Scroll to the bottom and click **Delete this repository**
4. Confirm by typing the repository name

> **If you might re-run the workshop or want to keep the code for reference**, you can leave your generated repository in place. GitHub doesn't charge for repositories.

## Verify Cleanup

### Check That Azure Resources Are Deleted

```bash
az group show --name "$RESOURCE_GROUP" 2>/dev/null || echo "Resource group deleted"
```

If the resource group is deleted, this returns "✓ Resource group deleted". If it still exists, you'll see the resource group details.

### Check That the Service Principal Is Deleted (Optional)

```bash
az ad sp show --id {APP_ID} 2>/dev/null || echo "✓ Service principal deleted"
```

## Final Checklist

- [ ] SRE Agent Object (principal) ID captured before agent deletion
- [ ] Exact subscription-scope Monitoring Contributor assignment reviewed
- [ ] Exact assignment deleted and the verification list returned no assignment
- [ ] SRE Agent deleted
- [ ] Azure resource group cleanup started with the capsule cleanup script
- [ ] Verified deletion: `az group show --name "$RESOURCE_GROUP"` returns an error
- [ ] Service principal deleted (optional): `az ad sp delete --id {APP_ID}`
- [ ] GitHub Actions secrets removed from your generated repository (optional but recommended)
- [ ] Service principal app removed from your Azure AD (optional)
- [ ] Generated repository deleted (optional if you don't need it anymore)

## What You Accomplished 🎉

Over the course of this workshop, you:

1. **Deployed realistic Azure infrastructure** using Bicep — an AKS cluster with workload identity, a CosmosDB database with managed access controls, and comprehensive monitoring
2. **Deployed a cloud-native application** to Kubernetes with secure, identity-based authentication to a backend service
3. **Onboarded the Azure SRE Agent** and saw it build a knowledge base of your application architecture, deployment pipelines, and monitoring
4. **Simulated a real operational failure** — a seemingly innocent infrastructure change (removing a role assignment) that broke your application
5. **Observed AI-powered incident response** — the SRE Agent detected the failure, investigated logs and metrics, correlated the issue to a recent deployment, identified the root cause, and proposed a fix
6. **Practiced governed remediation** — after approval, the SRE Agent created one issue assigned to `@copilot`; you reviewed and merged its PR, and an operator manually deployed the Bicep fix

This is exactly what the Azure SRE Agent does in production environments: detect anomalies, investigate root cause, and recommend or execute fixes — dramatically reducing the time your team spends on incident triage and recovery.

## Questions?

- **Workshop documentation:** Refer back to any module (0–6)
- **Azure SRE Agent docs:** [Azure SRE Agent documentation](https://learn.microsoft.com/azure/sre-agent)
- **Azure CLI reference:** [Azure CLI documentation](https://docs.microsoft.com/cli/azure/)
- **Kubernetes basics:** [Kubernetes documentation](https://kubernetes.io/docs)

Thank you for completing the workshop. Happy remediating! 🚀
