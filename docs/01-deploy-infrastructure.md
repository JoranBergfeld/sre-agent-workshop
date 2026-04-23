# Module 1: Deploy Infrastructure (~30 min)

## Overview

This module walks you through provisioning all the Azure infrastructure for the workshop: an AKS cluster, CosmosDB serverless database, centralized logging and monitoring, and a managed identity with workload identity configured for secure app-to-database authentication. All resources are defined in Bicep and deployed via a GitHub Actions workflow.

After this module completes, you'll have a fully-functional Kubernetes cluster and backend database ready for the application deployment in Module 2.

## What Gets Deployed

The workflow deploys the following Azure resources to your subscription. All resource names are prefixed with your `workloadName` (default: `srelab`):

| Resource | Name Pattern | Purpose |
|----------|--------------|---------|
| Resource Group | `rg-{workloadName}` | Container for all workshop resources |
| AKS Cluster | `{workloadName}-aks` | Kubernetes cluster hosting the web app; workload identity + OIDC issuer enabled |
| CosmosDB Account | `{workloadName}-cosmos-{suffix}` | Serverless NoSQL database; globally unique name with 4-char suffix |
| Log Analytics Workspace | `{workloadName}-law` | Centralized logging for AKS cluster, pods, and application |
| Application Insights | `{workloadName}-ai` | Application performance monitoring and diagnostics |
| User-Assigned Managed Identity | `{workloadName}-id` | Workload identity for the app to authenticate to CosmosDB |
| Federated Identity Credential | Automatic | Maps Kubernetes ServiceAccount → Azure managed identity |
| CosmosDB Role Assignment | Automatic | Grants the managed identity permission to read database data |
| Alert Rule | `{workloadName}-container-restarts` | Monitors container restart count; triggers incident response in Module 4 |
| Alert Rule | `{workloadName}-http-500-errors` | Monitors HTTP 500 errors in container logs; triggers incident response in Module 4 |

**Cluster Configuration:**
- **Nodes:** 2× Standard_D2ads_v6 VMs (Linux system node pool)
- **Kubernetes version:** 1.34
- **OIDC Issuer:** Enabled (required for workload identity)
- **Workload Identity:** Enabled (secure pod auth without storing secrets)

> **⚠️ VM Size Note:** The default VM size (`Standard_D2ads_v6`) may not be available in every subscription or region. If the deployment fails with a "VM size not allowed" error, check the error message for a list of available sizes and update `infra/bicep/modules/aks.bicep` (the `vmSize` property) accordingly. Any 2-vCPU general-purpose VM from the allowed list will work.

## Prerequisites: Register Azure Resource Providers

Before deploying, ensure the required Azure resource providers are registered on your subscription. These are needed by the various Azure services used in this workshop:

| Resource Provider | Required By |
|---|---|
| `Microsoft.ContainerService` | AKS cluster |
| `Microsoft.DocumentDB` | CosmosDB (NoSQL) account |
| `Microsoft.OperationalInsights` | Log Analytics workspace |
| `Microsoft.Insights` | Application Insights & alert rules |
| `Microsoft.ManagedIdentity` | User-Assigned Managed Identity & federated credentials |
| `Microsoft.OperationsManagement` | Container Insights (AKS monitoring addon) |

> **Note:** Most of these providers are registered by default on new Azure subscriptions. However, `Microsoft.OperationsManagement` is commonly **not** registered and will cause the AKS Container Insights addon to fail silently if missing.

Register all providers with the Azure CLI:

```bash
az provider register --namespace Microsoft.ContainerService
az provider register --namespace Microsoft.DocumentDB
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.Insights
az provider register --namespace Microsoft.ManagedIdentity
az provider register --namespace Microsoft.OperationsManagement
```

To verify registration status:

```bash
az provider show --namespace Microsoft.OperationsManagement --query "registrationState" -o tsv
```

Registration is typically instant but can take up to a few minutes. Wait for all providers to show `Registered` before proceeding.

---

## Run the Deployment

Choose one of the two deployment options below. **Option A (GitHub Actions) is recommended** for the full workshop experience, as the push trigger enables the Module 5 fault injection scenario. Option B is useful for local testing and development.

### Option A: GitHub Actions (Recommended)

#### Step 1: Navigate to GitHub Actions

Go to your fork of the workshop repository on GitHub:
1. Click the **Actions** tab at the top
2. In the left sidebar, select **Deploy Infrastructure** workflow

#### Step 2: Trigger the Workflow

1. Click the **Run workflow** button (green button on the right)
2. Configure the workflow inputs:

   - **location** (dropdown)  
     Choose your Azure region. Supported options:
     - `eastus2` (recommended for US)
     - `swedencentral` (recommended for Europe)
     - `australiaeast` (recommended for Asia-Pacific)
   
   - **workloadName** (text input)  
     Defaults to `srelab`. You can customize this if desired (e.g., `srelab-team1`). This name is used in all resource naming. **Keep this name handy — you'll need it in future modules.** Use lowercase alphanumeric only, no special characters.

3. Click **Run workflow**

#### Step 3: Monitor the Deployment

The workflow will start immediately. You'll see a yellow icon next to the workflow name while it's running. The deployment typically takes **10–15 minutes**.

**To watch the logs:**
1. Click on the workflow run (it appears at the top of the Actions list)
2. Click the **deploy** job in the left sidebar
3. Watch the steps execute in real-time

The workflow performs these steps:
- Creates the resource group (`rg-{workloadName}`)
- Deploys the monitoring stack (Log Analytics + Application Insights)
- Deploys the AKS cluster with workload identity enabled
- Deploys the CosmosDB account and database
- Creates the managed identity and federated credential
- Sets up the CosmosDB role assignment
- Creates the alert rule
- Outputs key resource names and IDs

**Expected final output:**
```
============================================
  Infrastructure Deployment Complete
============================================
Resource Group:      rg-srelab
Location:            eastus2
AKS Cluster:         srelab-aks
CosmosDB Endpoint:   https://srelab-cosmos-xxxx.documents.azure.com:443/
UAMI Client ID:     xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Log Analytics ID:    /subscriptions/.../resourceGroups/rg-srelab/providers/...
============================================
```

---

### Option B: Local CLI Deployment

Deploy infrastructure directly from your machine using the Azure CLI. This is useful for rapid testing, development iterations, or situations where you prefer manual control.

#### Prerequisites

- **Azure CLI** installed and authenticated:
  ```bash
  az --version
  az login
  ```
- **jq** installed (for parsing deployment outputs):
  - macOS: `brew install jq`
  - Linux: `apt-get install jq` or `yum install jq`
  - Windows: Download from https://stedolan.github.io/jq/download/

#### Step 1: Set Environment Variables

Replace `srelab` and `eastus2` with your desired workload name and location:

```bash
export WORKLOAD_NAME="srelab"
export LOCATION="eastus2"
```

**Supported locations:**
- `eastus2` (recommended for US)
- `swedencentral` (recommended for Europe)
- `australiaeast` (recommended for Asia-Pacific)

**Workload name guidelines:**
- Lowercase alphanumeric only (e.g., `srelab`, `srelab-team1`, `mysre123`)
- Keep it short — it's used in all resource names
- Remember this name for future modules

#### Step 2: Create the Resource Group

```bash
az group create \
  --name "rg-${WORKLOAD_NAME}" \
  --location "${LOCATION}" \
  --tags workshop=sre-agent environment=demo
```

**Expected output:**
```json
{
  "id": "/subscriptions/.../resourceGroups/rg-srelab",
  "location": "eastus2",
  "managedBy": null,
  "name": "rg-srelab",
  "properties": {
    "provisioningState": "Succeeded"
  },
  "tags": {
    "environment": "demo",
    "workshop": "sre-agent"
  },
  "type": "Microsoft.Resources/resourceGroups"
}
```

#### Step 3: Deploy the Bicep Template

From the repository root, run:

```bash
az deployment group create \
  --resource-group "rg-${WORKLOAD_NAME}" \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/main.bicepparam \
    location="${LOCATION}" \
    workloadName="${WORKLOAD_NAME}" \
  --query 'properties.outputs' \
  -o json > deployment-outputs.json

cat deployment-outputs.json
```

The deployment typically takes **10–15 minutes**. You'll see progress output as resources are created.

#### Step 4: Extract and Display Deployment Outputs

After the deployment completes, parse the outputs:

```bash
echo "============================================"
echo "  Infrastructure Deployment Complete"
echo "============================================"
echo "Resource Group:       rg-${WORKLOAD_NAME}"
echo "Location:             ${LOCATION}"
echo "AKS Cluster:          $(jq -r '.aksClusterName.value' deployment-outputs.json)"
echo "CosmosDB Endpoint:    $(jq -r '.cosmosDbEndpoint.value' deployment-outputs.json)"
echo "UAMI Client ID:       $(jq -r '.uamiClientId.value' deployment-outputs.json)"
echo "Log Analytics ID:     $(jq -r '.logAnalyticsWorkspaceId.value' deployment-outputs.json)"
echo "App Insights CS:      $(jq -r '.appInsightsConnectionString.value' deployment-outputs.json)"
echo "============================================"
```

#### Step 5: Save the UAMI Client ID for Module 2

You'll need the User-Assigned Managed Identity (UAMI) Client ID in Module 2. Extract it now:

```bash
export UAMI_CLIENT_ID=$(jq -r '.uamiClientId.value' deployment-outputs.json)
echo "Save this for Module 2: $UAMI_CLIENT_ID"
```

**Note on GitHub Actions vs. Local Deployment:**  
The GitHub Actions workflow includes a push trigger on `infra/**` changes. This is essential for **Module 5** (Break It), where you'll remove a Bicep role assignment and push to main. The workflow automatically re-deploys the broken infrastructure, triggering the fault scenario. If deploying locally, you can still complete Module 5 by re-running the deployment commands after making the Bicep change, or by using GitHub Actions for that module only.

## Verify Resources in Azure

Once the workflow completes, verify that all resources were created successfully:

### 1. Check Azure CLI Access

Authenticate to your Azure subscription (if not already authenticated):
```bash
az login
```

### 2. List All Resources

Replace `srelab` with your `workloadName` if you customized it:

```bash
az resource list --resource-group rg-srelab -o table
```

Expected output: ~8–10 resources including AKS cluster, CosmosDB, Log Analytics, Application Insights, managed identity, alert rules, etc. (Azure may auto-create additional resources like Smart Detection rules.)

### 3. Verify AKS Cluster

```bash
az aks show \
  --resource-group rg-srelab \
  --name srelab-aks \
  --query "{name:name, status:provisioningState, oidc:oidcIssuerProfile.enabled}" \
  -o table
```

Expected output:
```
Name        Status    Oidc
──────────  ────────  ─────
srelab-aks  Succeeded True
```

> The `oidc` field must be `True`. This enables workload identity, which is critical for Module 2.

### 4. Get AKS Credentials

Download the cluster credentials so `kubectl` can communicate with your cluster:

```bash
az aks get-credentials \
  --resource-group rg-srelab \
  --name srelab-aks
```

> **⚠️ Existing kubectl users:** If you already use `kubectl` with other clusters, this command adds a new context to your kubeconfig and sets it as the current context. Your existing cluster configurations are preserved — you can switch back with `kubectl config use-context <your-old-context>`.

### 5. Verify kubectl Works

```bash
kubectl get nodes
```

Expected output:
```
NAME                             STATUS   ROLES    AGE    VERSION
aks-system-########-vmss000000   Ready    <none>   10m    v1.34.x
aks-system-########-vmss000001   Ready    <none>   10m    v1.34.x
```

Both nodes should be in `Ready` state. If nodes show `NotReady` or `NotSchedulable`, wait a moment and try again — node initialization can take a few minutes.

### 6. Verify CosmosDB

```bash
az cosmosdb show \
  --resource-group rg-srelab \
  --name $(az cosmosdb list --resource-group rg-srelab --query "[0].name" -o tsv) \
  --query "{name:name, kind:kind, status:provisioningState}" \
  -o table
```

Expected output:
```
Name                  Kind              Status
--------------------  ----------------  ---------
srelab-cosmos-xxxx    GlobalDocumentDB  Succeeded
```

### 7. Verify Managed Identity

```bash
az identity show \
  --resource-group rg-srelab \
  --name srelab-id \
  --query "{name:name, clientId:clientId}" \
  -o table
```

Expected output:
```
Name       ClientId
─────────  ──────────────────────────────────────────
srelab-id  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Understanding the Architecture

The infrastructure implements a **workload identity** flow, which is the modern, secure way for pods in AKS to authenticate to Azure services without storing secrets in Kubernetes.

### The Authentication Chain

Here's how the app will authenticate to CosmosDB in Module 2:

```
┌─────────────────────────────────────────────────────────────┐
│ AKS Pod (app container)                                     │
│                                                             │
│  App uses: DefaultAzureCredential from @azure/identity     │
│  ↓                                                          │
│  Queries: AZURE_FEDERATED_TOKEN_FILE env var              │
│  ↓                                                          │
│  Finds: Kubernetes ServiceAccount JWT mounted at /run/...  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ AKS OIDC Issuer (OpenID Connect endpoint)                   │
│                                                             │
│  Kubernetes ServiceAccount (with workload identity         │
│  annotation client-id={UAMI ClientId}) is presented        │
│  ↓                                                          │
│  OIDC issuer validates JWT signature                       │
│  ↓                                                          │
│  Mints an Azure AD token for the managed identity          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Azure AD                                                    │
│                                                             │
│  Token claims: User-Assigned Managed Identity {UAMI}       │
│  ↓                                                          │
│  Response: Azure AD access token for CosmosDB service      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ CosmosDB                                                    │
│                                                             │
│  App includes: Bearer token (Azure AD access token)        │
│  ↓                                                          │
│  CosmosDB validates token against RBAC role assignment     │
│  ↓                                                          │
│  UAMI has "Cosmos DB Built-in Data Contributor" role      │
│  ↓                                                          │
│  Authorization succeeds → data returned                    │
└─────────────────────────────────────────────────────────────┘
```

**Key components:**
- **User-Assigned Managed Identity (UAMI):** An Azure identity that the app will use (not an app password or certificate)
- **Federated Identity Credential:** Links the Kubernetes ServiceAccount to the UAMI, allowing OIDC token exchange
- **OIDC Issuer:** AKS's built-in OpenID Connect server that issues tokens to workloads
- **CosmosDB Role Assignment:** Grants the UAMI the "Cosmos DB Built-in Data Contributor" role on the database

This chain is the foundation of what we'll break in **Module 5**. When we remove the CosmosDB role assignment in Module 5, the app will still be able to authenticate and get a token, but CosmosDB will reject the request with a 403 Forbidden error — the app is authorized to AKS but not authorized to CosmosDB.

## Troubleshooting

### Workflow Fails: AuthorizationFailed

**Symptom:** The GitHub Actions workflow fails with an error like:
```
AuthorizationFailed: The client '...' with object id '...' does not have authorization to perform action 'Microsoft.ContainerService/managedClusters/write'
```

**Cause:** Your GitHub Actions service principal doesn't have sufficient permissions on the subscription.

**Solution:**
1. Go to the Azure portal
2. Navigate to **Subscriptions** → your subscription → **Access control (IAM)**
3. Click **+ Add** → **Add role assignment**
4. Assign **Contributor** (or higher) role to the service principal used by GitHub Actions
5. Retry the workflow

---

### Workflow Fails: Region Not Supported

**Symptom:** Deployment fails with a message like `ResourceGroupNotFound` or `LocationNotAvailable`.

**Cause:** You selected a region that doesn't support all required Azure services (AKS, CosmosDB, Application Insights, etc.), or the region is not enabled for SRE Agent.

**Solution:** Use one of the supported regions:
- `eastus2`
- `swedencentral`
- `australiaeast`

These regions are tested and supported by the workshop. Retry the workflow with a supported location.

---

### Workflow Fails: Quota Exceeded

**Symptom:** Deployment fails with an error like `QuotaExceeded` or `SkuNotAvailable`.

**Cause:** Your subscription has hit a resource quota (e.g., vCPU limit, compute quota).

**Context:** The AKS cluster requires 4 vCPUs (2 nodes × 2 vCPU each for Standard_D2ads_v6 VMs).

**Solution:**
1. Check your current vCPU usage: Go to Azure portal → **Subscriptions** → **Usage + quotas**
2. Request a quota increase if needed (this can take a few hours to a day)
3. Alternatively, use a free trial or a different subscription with more available quota

---

### kubectl Commands Fail: "Unable to connect"

**Symptom:** `kubectl get nodes` fails with `Unable to connect to the server`.

**Cause:** Your local `kubectl` is not authenticated to the AKS cluster, or the cluster is still initializing.

**Solution:**
1. Re-run the credential fetch:
   ```bash
   az aks get-credentials --resource-group rg-srelab --name srelab-aks
   ```
2. Verify the kubeconfig context:
   ```bash
   kubectl config current-context
   ```
   Should show something like `srelab-aks` or similar.
3. Check cluster status in Azure:
   ```bash
   az aks show --resource-group rg-srelab --name srelab-aks --query provisioningState
   ```
   Should return `"Succeeded"`. If it shows `"Creating"` or other state, wait a few more minutes.

---

### Nodes Stay in NotReady State

**Symptom:** `kubectl get nodes` shows nodes in `NotReady` or `NotSchedulable` state after 15+ minutes.

**Cause:** Node initialization is slow or encountering an issue; rarely, there's a platform issue in the region.

**Solution:**
1. Check node status details:
   ```bash
   kubectl describe node <node-name>
   ```
2. Look for error messages or known issues
3. If initialization is stuck, wait another 5–10 minutes and retry
4. If the issue persists, consider restarting the node or recreating the cluster by re-running the workflow

---

## Checkpoint: Verify Everything Works

At this point, you should have:

✅ All Azure resources created in `rg-srelab`  
✅ AKS cluster with OIDC issuer and workload identity enabled  
✅ 2 nodes in `Ready` state  
✅ CosmosDB serverless account created  
✅ Managed identity and federated credential configured  
✅ Managed identity has CosmosDB reader role  
✅ Local `kubectl` connected to the cluster  

Run this quick verification:

```bash
# List resources
az resource list --resource-group rg-srelab --query "[].type" -o table | wc -l
# Should show: ~10

# Check nodes
kubectl get nodes
# Should show: 2 nodes in Ready state

# Check cluster readiness
az aks show --resource-group rg-srelab --name srelab-aks --query "provisioningState"
# Should show: "Succeeded"
```

If all checks pass, you're ready for **Module 2: Deploy the Application** ✨

## What's Next

The infrastructure is provisioned and ready. In Module 2, you'll:
1. Deploy the Node.js web application to the AKS cluster
2. Configure it to use the workload identity for CosmosDB authentication
3. Test the app endpoints and verify it can read data from the database

**→ [Module 2: Deploy the Application](./02-deploy-application.md)**

---

## Cost Reminder

⏱️ **Time:** Cluster initialization: ~10–15 min  
💰 **Cost:** This module costs approximately **$0.40–0.50/hour** while resources are running (AKS $0.25/hr + CosmosDB $0.05/hr + Monitoring $0.10/hr).

Remember to run **Module 7: Cleanup** at the end of the workshop to delete resources and stop incurring costs.
