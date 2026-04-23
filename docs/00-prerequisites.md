# Module 0: Prerequisites

## Overview

Before starting the workshop, you'll need an active Azure subscription, a few command-line tools, a GitHub account, and a handful of credentials. This module walks through each requirement and shows you how to validate your setup. Estimated time: **15 minutes of reading + 10 minutes of configuration**.

## Cost Estimate

The workshop creates several Azure resources that you'll pay for by the hour. Here's the breakdown:

| Resource | Hourly Cost |
|----------|------------|
| AKS (2× Standard_D2ads_v6 nodes) | ~$0.25 |
| CosmosDB (serverless, minimal RU) | ~$0.05 |
| Log Analytics + Application Insights | ~$0.10 |
| SRE Agent | ~$0.50 |
| **Total** | **~$1.00/hr** |

**For the full workshop (3–4 hours): ~$4–6 total cost.**

> **Budget $5–10 to be safe**, especially if you experiment or leave resources running longer than expected. CosmosDB charges per request unit (RU) consumed; monitoring charges based on ingestion volume. Both are minimal for a workshop scenario. Remember to run the cleanup module when done to stop incurring costs.

## Requirements

### 1. Azure Subscription

- **Minimum role:** Contributor (to create and manage resources)
- **Optional role:** Owner or User Access Administrator (if you plan to create custom role assignments)
- **Check your access:** Log in to the [Azure Portal](https://portal.azure.com) and verify you can see your subscription

### 2. Supported Azure Region

The SRE Agent is available in specific regions. You **must** deploy this workshop to one of these three:

- **East US 2**
- **Sweden Central**
- **Australia East**

> When deploying infrastructure (Module 1), you'll specify your region. Pick the one closest to you or your team for lowest latency.

### 3. Network Access

Your network must allow outbound HTTPS traffic to:
- `*.azuresre.ai` (SRE Agent portal and services)
- `*.azurerm.com` (Azure API endpoints)
- `ghcr.io` (GitHub Container Registry, for the container image)

Most corporate networks allow this by default. If you're behind a strict firewall, contact your network team.

### 4. Required Tools

#### Azure CLI (`az`)

[Install Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) — the command-line interface for managing Azure resources.

**Quick check:**
```bash
az --version
```

#### kubectl

[Install kubectl](https://kubernetes.io/docs/tasks/tools/) — the command-line interface for Kubernetes.

**Quick check:**
```bash
kubectl version --client
```

#### GitHub CLI (`gh`)

[Install GitHub CLI](https://cli.github.com/) — optional but helpful for testing GitHub connectivity.

**Quick check:**
```bash
gh --version
```

#### Docker (optional)

Not required for this workshop (we use a pre-built container image), but helpful if you want to inspect or modify the web app locally.

### 5. GitHub Account

- You must have a GitHub account to fork the workshop repository
- Your account must have permission to fork repositories and create repositories under your personal account or organization
- [Sign up for free here](https://github.com/signup) if you don't have an account

## Step 1: Fork the Repository

The workshop repository is a template. You'll fork it to your own GitHub account, configure it with your Azure credentials, and all deployments will run against your own Azure subscription.

**Steps:**

1. Navigate to the workshop repository on GitHub: [sre-agent-workshop](https://github.com/Azure-Samples/sre-agent-workshop) (or your team's fork)
2. Click the **Fork** button in the top-right corner
3. Choose your personal account or organization as the fork destination
4. Click **Create fork**
5. Clone your fork locally:
   ```bash
   git clone https://github.com/{YOUR_USERNAME}/sre-agent-workshop.git
   cd sre-agent-workshop
   ```

Now all your work will be in your own fork, and the SRE Agent will open pull requests against *your* fork.

## Step 2: Create a Service Principal for GitHub Actions

GitHub Actions workflows in your fork need credentials to deploy infrastructure to your Azure subscription. We'll create a service principal with Contributor access to your subscription.

### Get Your Subscription ID

```bash
az login
export SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Your subscription ID: $SUBSCRIPTION_ID"
```

Keep this terminal open — you'll use `$SUBSCRIPTION_ID` in the next step.

### Create a Service Principal

```bash
az ad sp create-for-rbac \
  --name "sre-workshop-sp" \
  --role Contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID \
  --years 0.08 \
  --json-auth
```

> **Security best practice:** The `--years 0.08` flag sets the credential to expire after ~30 days, which is compliant with most restrictive tenant policies. Always delete the service principal when done (see Module 7).

This command outputs a JSON block containing the service principal credentials. **Copy the entire JSON output** — you'll paste it into GitHub next.

## Step 3: Configure GitHub Actions Secrets

Your fork needs the service principal credentials as a GitHub Actions secret. Anyone with access to your fork can trigger workflows, so treat this secret with care.

**Steps:**

1. Go to your fork on GitHub (https://github.com/{YOUR_USERNAME}/sre-agent-workshop)
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add this secret:

| Secret Name | Value | How to get it |
|-------------|-------|--------------|
| `AZURE_CREDENTIALS` | The full JSON block from the `az ad sp create-for-rbac` command | Run the command above and copy the entire JSON output |

> **Security note:** GitHub encrypts these secrets in transit and at rest. They're only exposed to workflows running in your repository and cannot be read back via the GitHub UI.

## Step 4: Verify Your Setup

Run these commands to confirm everything is ready:

```bash
# Verify Azure CLI and authentication
az login
az account show

# Verify kubectl
kubectl version --client

# Verify GitHub CLI (optional)
gh auth status

# Verify your fork is cloned
cd sre-agent-workshop
git remote -v  # should show your fork as origin
```

**Expected output:**
- `az account show` displays your subscription name and ID
- `kubectl version --client` shows a version number (e.g., v1.28.0)
- `gh auth status` shows "Logged in to github.com..." (if installed)
- `git remote -v` shows your fork URL for both fetch and push

## Checklist

Before moving to Module 1, verify:

- [ ] Azure subscription with Contributor access
- [ ] Azure region selected (East US 2, Sweden Central, or Australia East)
- [ ] Network can reach `*.azuresre.ai` and `ghcr.io`
- [ ] Azure CLI installed and logged in (`az account show` works)
- [ ] kubectl installed (`kubectl version --client` works)
- [ ] GitHub account created
- [ ] Repository forked to your account
- [ ] Service principal created and JSON saved
- [ ] `AZURE_CREDENTIALS` secret added to your fork
- [ ] Secrets are visible in Settings → Secrets and variables → Actions

## Cost Reminder

You're about to provision real Azure resources that incur hourly charges. The workshop should take **3–4 hours total**, so budget for **~$5–10**. When you're done, **run the cleanup steps in Module 7** to delete all resources and stop incurring charges.

## Next Step

→ **[Module 1: Deploy Infrastructure](./01-deploy-infrastructure.md)**

Ready? Proceed to Module 1 to deploy the AKS cluster, CosmosDB, monitoring, and managed identity resources using Bicep.
