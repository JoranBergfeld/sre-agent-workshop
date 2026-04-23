# Module 2: Deploy the Application (~30 min)

## Overview

You've got the infrastructure running. Now let's deploy the workshop web app to your AKS cluster. The app is a simple Node.js service that connects to CosmosDB using **workload identity** — no passwords, no connection strings in your code. When everything works, you'll see items flowing from the database. This is the "before" state that we'll deliberately break in Module 5.

## How the App Works

**Quick tech summary:**

- **Runtime:** Node.js/Express running in a container (image publicly published to GitHub Packages — no build needed, no authentication required to pull)
- **Three endpoints:**
  - `GET /` — Landing page showing connection status and pod info
  - `GET /health` — Health check (used by Kubernetes liveness/readiness probes)
  - `GET /items` — Reads items from CosmosDB using the app's managed identity
- **Authentication:** Uses `@azure/identity` library's `DefaultAzureCredential` to automatically pick up the workload identity credentials
- **The magic:** Kubernetes injects the OIDC token → Azure AD exchanges it for a managed identity token → CosmosDB verifies the token and checks the RBAC role assignment → database access granted

This is exactly how production apps authenticate to Azure services in AKS — no service account keys, no connection strings to rotate.

## Deploy via GitHub Actions

1. **Go to your fork** on GitHub → **Actions** tab
2. **Select the workflow:** `Deploy Application`
3. **Click "Run workflow"** (dropdown in the upper right)
4. Fill in the workflow inputs:
   - **workloadName** (default: `srelab`) — **must match what you used in Module 1**. If you deployed infrastructure with a different name, use the same name here.
5. **Click "Run workflow"** and wait for completion (~3–5 minutes)

**What the workflow does under the hood:**

- Gets your AKS cluster credentials
- Queries Azure for the UAMI client ID and CosmosDB endpoint (from Module 1 outputs)
- Substitutes placeholders in the Kubernetes manifests (`${COSMOSDB_ENDPOINT}`)
- Creates the workshop namespace, service account, deployment, and service
- Waits for pods to be ready (rollout completion)

## Verify the Deployment

First, make sure you have AKS credentials:

```bash
# Get AKS credentials (if you haven't done this since Module 1)
az aks get-credentials --resource-group rg-srelab --name srelab-aks
```

Now check that the pods are running:

```bash
# List pods in the workshop namespace
kubectl get pods -n workshop

# Expected output:
# NAME                       READY   STATUS    RESTARTS   AGE
# web-app-5d8c4f7b9d-abc12   1/1     Running   0          2m
# web-app-5d8c4f7b9d-def45   1/1     Running   0          2m
```

Both replicas should be in `Running` state and `Ready 1/1`.

Check that the service has an external IP assigned:

```bash
# List services
kubectl get svc -n workshop

# Expected output:
# NAME      TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)        AGE
# web-app   LoadBalancer   10.0.123.456   20.123.45.67    80:31234/TCP   1m
```

Wait for the `EXTERNAL-IP` to appear (if it shows `<pending>`, wait 1–2 minutes and run the command again).

## Test the App

Once the service has an external IP:

```bash
# Capture the external IP
export APP_IP=$(kubectl get svc web-app -n workshop -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

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
kubectl describe pod -n workshop <pod-name>
# Look for "Insufficient cpu" or "Insufficient memory" in events
```
This usually means the cluster nodes don't have enough capacity. Check that Module 1 successfully created the AKS nodes.

**ImagePullBackOff error:**
```bash
kubectl describe pod -n workshop <pod-name>
# Look for the "Events" section — it will show the exact image URL and pull error
```
The workflow pulls from `ghcr.io/<owner>/sre-agent-workshop/app:latest`. The image is publicly available — no authentication is needed. Common causes:
- The `OWNER` placeholder wasn't substituted (check the image URL in the pod events)
- The image hasn't been published yet for your fork — run the **Publish Container Image** workflow first (push any change to `src/` on main, or run it manually)
- A `latest-broken` tag exists for the fault-injection scenario in Module 5 — make sure you're using `latest` for initial deployment

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
kubectl logs -n workshop <pod-name>
```
The workload identity isn't being picked up. Verify:
- The deployment has the label `azure.workload.identity/use: "true"` (it should)
- The cluster has workload identity enabled (Module 1 should have set it up)

## Next Step

→ **[Module 3: Onboard the Azure SRE Agent](./03-onboard-sre-agent.md)**

In the next module, you'll create an SRE Agent and teach it about your infrastructure. The agent will learn your architecture, read your code, and build the knowledge it needs to diagnose faults when things go wrong.
