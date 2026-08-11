# Module 2: Deploy the Application (~30 min)

## Overview

You've got the infrastructure running. Now let's deploy the workshop web app to your AKS cluster. The app is a simple Node.js service that connects to CosmosDB using **workload identity** — no passwords, no connection strings in your code. When everything works, you'll see items flowing from the database. This is the "before" state that we'll deliberately break in Module 5.

## How the App Works

**Quick tech summary:**

- **Runtime:** Node.js/Express running in a scenario-specific GHCR container image
- **Three endpoints:**
  - `GET /` — Landing page showing connection status and pod info
  - `GET /health` — Health check (used by Kubernetes liveness/readiness probes)
  - `GET /items` — Reads items from CosmosDB using the app's managed identity
- **Authentication:** Uses `@azure/identity` library's `DefaultAzureCredential` to automatically pick up the workload identity credentials
- **The magic:** Kubernetes injects the OIDC token → Azure AD exchanges it for a managed identity token → CosmosDB verifies the token and checks the RBAC role assignment → database access granted

This is exactly how production apps authenticate to Azure services in AKS — no service account keys, no connection strings to rotate.

## Deploy via GitHub Actions

1. **Publish an immutable image first.** Run `Publish Cosmos RBAC Removal Image` from the **Actions** tab, or push an application change to `main`. It publishes `ghcr.io/<owner>/<repository>/cosmos-rbac-removal/app:<commit-sha>`. Copy the published commit SHA from that workflow run.
2. **Configure GHCR access.** Add the repository secret `GHCR_READ_TOKEN`, using a fine-grained (or classic) PAT with **Packages: read** access. The deployment workflow uses it to create the `ghcr-pull` Kubernetes secret, so the image does not need to be public.
3. **Go to your generated repository** on GitHub → **Actions** tab and select `Deploy Cosmos RBAC Removal Application`.
4. **Click "Run workflow"** (dropdown in the upper right) and fill in:
   - **workloadName** (default: `srelabcosmos`) — **must match what you used in Module 1**.
   - **imageTag** — the published full 40-character lowercase Git SHA from `Publish Cosmos RBAC Removal Image` (for example, `0123456789abcdef0123456789abcdef01234567`).
5. **Click "Run workflow"** and wait for completion (~3–5 minutes). The workflow preflights and deploys exactly `ghcr.io/<owner>/<repository>/cosmos-rbac-removal/app:<imageTag>`.

**What the workflow does under the hood:**

- Gets your AKS cluster credentials
- Queries Azure for the UAMI client ID and CosmosDB endpoint (from Module 1 outputs)
- Substitutes placeholders in the Kubernetes manifests (`${COSMOSDB_ENDPOINT}`)
- Creates or updates the `ghcr-pull` image-pull secret, `cosmos-rbac-removal` namespace, service account, deployment, and service
- Waits for pods to be ready (rollout completion)

## Verify the Deployment

First, make sure you have AKS credentials:

```bash
# Get AKS credentials (if you haven't done this since Module 1)
export WORKLOAD_NAME="srelabcosmos"
export RESOURCE_GROUP="rg-${WORKLOAD_NAME}"
export SUBSCRIPTION_ID="<subscription-id>"
az account set --subscription "$SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "${WORKLOAD_NAME}-aks"
```

Now check that the pods are running:

```bash
# List pods in the cosmos-rbac-removal namespace
kubectl get pods -n cosmos-rbac-removal

# Expected output:
# NAME                       READY   STATUS    RESTARTS   AGE
# cosmos-rbac-removal-app-5d8c4f7b9d-abc12   1/1     Running   0          2m
# cosmos-rbac-removal-app-5d8c4f7b9d-def45   1/1     Running   0          2m
```

Both replicas should be in `Running` state and `Ready 1/1`.

Check that the service has an external IP assigned:

```bash
# List services
kubectl get svc -n cosmos-rbac-removal

# Expected output:
# NAME      TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)        AGE
# cosmos-rbac-removal-app   LoadBalancer   10.0.123.456   20.123.45.67    80:31234/TCP   1m
```

Wait for the `EXTERNAL-IP` to appear (if it shows `<pending>`, wait 1–2 minutes and run the command again).

## Test the App

Once the service has an external IP:

```bash
# Capture the external IP
export APP_IP=$(kubectl get svc cosmos-rbac-removal-app -n cosmos-rbac-removal -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test the health endpoint (should always return 200)
curl http://$APP_IP/health

# Expected output:
# {"status":"healthy","timestamp":"2026-04-12T10:23:45.123Z"}
```

```bash
# Test the items endpoint (reads from CosmosDB)
curl http://$APP_IP/items

# Expected output:
# 200 OK with [] (empty array) or a list of items if any exist
```

```bash
# Visit the landing page in your browser
echo "Open http://$APP_IP in your browser"

# You should see an HTML page showing:
# - CosmosDB Status: connected
# - Pod name and namespace
```

**Checkpoint:** If `/items` returns `200` with an empty array or items list, the workload identity authentication chain is working:

```
Pod (with Kubernetes OIDC token)
  ↓
ServiceAccount (annotated with UAMI client ID)
  ↓
Federated Credential (links K8s ServiceAccount to Azure managed identity)
  ↓
User-Assigned Managed Identity (UAMI)
  ↓
CosmosDB Role Assignment (RBAC grants the UAMI data-plane access)
  ↓
Database Access ✓
```

## Troubleshooting

**Pods stuck in `Pending` state:**
```bash
# Check node capacity and pod events
kubectl describe pod -n cosmos-rbac-removal <pod-name>
# Look for "Insufficient cpu" or "Insufficient memory" in events
```
This usually means the cluster nodes don't have enough capacity. Check that Module 1 successfully created the AKS nodes.

**ImagePullBackOff error:**
```bash
kubectl describe pod -n cosmos-rbac-removal <pod-name>
# Look for the "Events" section — it will show the exact image URL and pull error
```
The workflow deploys `ghcr.io/<owner>/<repository>/cosmos-rbac-removal/app:<imageTag>` and pulls it using `ghcr-pull`. Common causes:
- `GHCR_READ_TOKEN` is missing, expired, or lacks **Packages: read** access
- The value entered for `imageTag` was not published by `Publish Cosmos RBAC Removal Image`
- The pod spec is not using `ghcr-pull` (check the image URL and image pull secrets in the pod events)

**`/items` returns 500 with auth error:**
```bash
curl -v http://$APP_IP/items
# Check the error message for clues about federated credential, RBAC, or role assignment
```
This means one of the identity/RBAC chain steps failed. Common causes:
- Federated credential not created (Module 1 deployment failed)
- UAMI role assignment not created (Module 1 deployment failed)
- ServiceAccount annotation not matching the UAMI client ID
- CosmosDB firewall blocking the connection (less likely in a workshop environment)

**Pod logs show "DefaultAzureCredential" errors:**
```bash
kubectl logs -n cosmos-rbac-removal <pod-name>
```
The workload identity isn't being picked up. Verify:
- The deployment has the label `azure.workload.identity/use: "true"` (it should)
- The cluster has workload identity enabled (Module 1 should have set it up)

## Next Step

→ **[Module 3: Onboard the Azure SRE Agent](./03-onboard-sre-agent.md)**

In the next module, you'll create an SRE Agent and teach it about your infrastructure. The agent will learn your architecture, read your code, and build the knowledge it needs to diagnose faults when things go wrong.
