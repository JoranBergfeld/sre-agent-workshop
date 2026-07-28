# Module 7: Cleanup

## Overview

Congratulations! You've completed the workshop and seen the Azure SRE Agent in action. Now it's time to tear down all the resources you created so you stop incurring costs. This module walks you through deletion of Azure resources, the SRE Agent, and GitHub secrets. Estimated time: **10 minutes**.

> **Important:** Once you delete a resource, it cannot be recovered. Only proceed if you're finished experimenting with the workshop environment.

## Delete Azure Resources

All your workshop resources (AKS, CosmosDB, Log Analytics, Application Insights, managed identity, and role assignments) live in a single resource group. Deleting the resource group deletes everything in one command.

### Get Your Resource Group Name

When you deployed infrastructure (Module 1), you specified a resource group name. It's likely one of:
- `rg-srelab` (if you used the default)
- Check the Azure Portal: navigate to **Resource Groups** and look for the one you created

### Delete the Resource Group

Replace `{RG_NAME}` with your actual resource group name:

```bash
az group delete --name {RG_NAME} --yes --no-wait
```

**What this does:**
- `--yes` skips the confirmation prompt
- `--no-wait` returns immediately without waiting for deletion to complete (it runs in the background)

**To monitor deletion:**
```bash
az group show --name {RG_NAME}
```

This command will return an error once the resource group is deleted (which is the expected outcome).

**Example (with default name):**
```bash
az group delete --name rg-srelab --yes --no-wait
```

> **Note:** Deletion typically takes 5–10 minutes. You'll stop incurring hourly charges immediately, but Azure may take a moment to fully remove the resources from billing.

## Delete the SRE Agent

The SRE Agent resource itself was created in your resource group, so it was already deleted in the step above. However, if you created an agent in a separate subscription or resource group, follow these steps:

### Via the Azure Portal

1. Navigate to the [Azure Portal](https://portal.azure.com)
2. Go to your resource group (or all resources)
3. Search for the SRE Agent resource by name
4. Click on it to open the resource page
5. Click **Delete** in the top menu bar
6. Confirm the deletion

### Via the SRE Agent Portal

1. Navigate to [sre.azure.com](https://sre.azure.com)
2. Select your agent from the list
3. Click **Settings** (gear icon)
4. Click **Delete agent** at the bottom
5. Confirm deletion

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

Your fork still has the `AZURE_CREDENTIALS` secret configured. If you no longer need it, remove it:

1. Go to your fork on GitHub (https://github.com/{YOUR_USERNAME}/sre-agent-workshop)
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click the trash icon next to `AZURE_CREDENTIALS` to delete it

> **Why:** Reduces the attack surface if your fork is compromised. An attacker with access to these secrets could deploy resources to your subscription.

### Delete Your Fork (Optional)

If you won't use the workshop repository anymore, you can delete your fork:

1. Go to your fork on GitHub
2. Click **Settings** at the top
3. Scroll to the bottom and click **Delete this repository**
4. Confirm by typing the repository name

> **If you might re-run the workshop or want to keep the code for reference**, you can leave your fork in place. GitHub doesn't charge for repositories.

## Verify Cleanup

### Check That Azure Resources Are Deleted

```bash
az group show --name {RG_NAME} 2>/dev/null || echo "✓ Resource group deleted"
```

If the resource group is deleted, this returns "✓ Resource group deleted". If it still exists, you'll see the resource group details.

### Check That the Service Principal Is Deleted (Optional)

```bash
az ad sp show --id {APP_ID} 2>/dev/null || echo "✓ Service principal deleted"
```

## Final Checklist

- [ ] Azure resource group deleted (`az group delete --name {RG_NAME} --yes --no-wait`)
- [ ] Verified deletion: `az group show --name {RG_NAME}` returns an error
- [ ] Service principal deleted (optional): `az ad sp delete --id {APP_ID}`
- [ ] GitHub Actions secrets removed from your fork (optional but recommended)
- [ ] Service principal app removed from your Azure AD (optional)
- [ ] Fork deleted (optional if you don't need it anymore)

## What You Accomplished 🎉

Over the course of this workshop, you:

1. **Deployed realistic Azure infrastructure** using Bicep — an AKS cluster with workload identity, a CosmosDB database with managed access controls, and comprehensive monitoring
2. **Deployed a cloud-native application** to Kubernetes with secure, identity-based authentication to a backend service
3. **Onboarded the Azure SRE Agent** and saw it build a knowledge base of your application architecture, deployment pipelines, and monitoring
4. **Simulated a real operational failure** — a seemingly innocent infrastructure change (removing a role assignment) that broke your application
5. **Observed AI-powered incident response** — the SRE Agent detected the failure, investigated logs and metrics, correlated the issue to a recent deployment, identified the root cause, and proposed a fix
6. **Saw automated remediation** — the SRE Agent opened a pull request with the fix, which you reviewed and merged, restoring service

This is exactly what the Azure SRE Agent does in production environments: detect anomalies, investigate root cause, and recommend or execute fixes — dramatically reducing the time your team spends on incident triage and recovery.

## Questions?

- **Workshop documentation:** Refer back to any module (0–6)
- **Azure SRE Agent docs:** [Azure SRE Agent documentation](https://learn.microsoft.com/azure/sre-agent)
- **Azure CLI reference:** [Azure CLI documentation](https://docs.microsoft.com/cli/azure/)
- **Kubernetes basics:** [Kubernetes documentation](https://kubernetes.io/docs)

Thank you for completing the workshop. Happy remediating! 🚀
