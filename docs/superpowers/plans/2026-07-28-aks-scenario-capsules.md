# AKS Scenario Capsules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the AKS workshop into independent `cosmos-rbac-removal` and `workload-identity-break` scenario capsules.

**Architecture:** Each capsule receives its own AKS, Cosmos DB, workload identity, Node.js application, Kubernetes manifests, docs, knowledge, and lifecycle scripts. Each Bicep entry point deploys only its own incident alert, and each scenario has its own image and deployment workflows.

**Tech Stack:** AKS, Cosmos DB NoSQL, Bicep, Kubernetes YAML, Node.js/Express, GHCR, Bash, PowerShell.

---

### Task 1: Copy the AKS substrate into both capsules

**Files:**
- Copy from: `workshops/aks/**`
- Create: `scenarios/cosmos-rbac-removal/**`
- Create: `scenarios/workload-identity-break/**`

- [ ] **Step 1: Create both capsule roots**

```bash
mkdir -p scenarios/{cosmos-rbac-removal,workload-identity-break}/{infra/bicep/modules,investigation,scripts}
```

- [ ] **Step 2: Copy shared deployable assets**

```bash
for id in cosmos-rbac-removal workload-identity-break; do
  cp -a workshops/aks/docs "scenarios/$id/"
  cp -a workshops/aks/k8s "scenarios/$id/"
  cp -a workshops/aks/knowledge "scenarios/$id/"
  cp -a workshops/aks/src "scenarios/$id/"
  cp -a workshops/aks/scripts/. "scenarios/$id/scripts/"
  cp workshops/aks/infra/bicep/main.bicep "scenarios/$id/infra/bicep/"
  cp workshops/aks/infra/bicep/main.bicepparam "scenarios/$id/infra/bicep/"
  cp workshops/aks/infra/bicep/modules/{aks,cosmosdb,identity,monitoring}.bicep \
    "scenarios/$id/infra/bicep/modules/"
done
```

- [ ] **Step 3: Copy scenario-specific assets**

For each ID:

```bash
cp workshops/aks/scenarios/$id/README.md scenarios/$id/
cp workshops/aks/scenarios/$id/scenario.yaml scenarios/$id/
cp workshops/aks/scenarios/$id/query.kql scenarios/$id/investigation/
cp workshops/aks/scenarios/$id/alert.bicep scenarios/$id/infra/bicep/modules/alert.bicep
cp workshops/aks/scenarios/$id/{inject,validate,remediate}.{sh,ps1} scenarios/$id/scripts/
```

- [ ] **Step 4: Preserve Bash executability**

```bash
chmod +x scenarios/{cosmos-rbac-removal,workload-identity-break}/scripts/*.sh
```

- [ ] **Step 5: Commit copied capsules**

```bash
git add scenarios/cosmos-rbac-removal scenarios/workload-identity-break
git commit -m "refactor: create standalone aks scenario capsules"
```

### Task 2: Convert both manifests

**Files:**
- Modify: `scenarios/cosmos-rbac-removal/scenario.yaml`
- Modify: `scenarios/workload-identity-break/scenario.yaml`

- [ ] **Step 1: Write the Cosmos RBAC manifest**

Use the current title, summary, objectives, severity, duration, and remediation description,
with these capsule fields:

```yaml
platform: Azure Kubernetes Service
incidentType: Dependency authorization failure
costProfile: high
guide: README.md
setup: { bash: scripts/setup.sh, powershell: scripts/setup.ps1 }
inject: { bash: scripts/inject.sh, powershell: scripts/inject.ps1 }
validate: { bash: scripts/validate.sh, powershell: scripts/validate.ps1 }
cleanup: { bash: scripts/cleanup.sh, powershell: scripts/cleanup.ps1 }
signal:
  alertModule: infra/bicep/modules/alert.bicep
  alertName: http-500-errors
remediate:
  - action: restore-cosmos-rbac
    bash: scripts/remediate.sh
    powershell: scripts/remediate.ps1
    description: Recreate the Cosmos DB Built-in Data Contributor role assignment for the workload UAMI and restart pods.
investigation: { query: investigation/query.kql }
source: src/app
```

Remove `track` and `docPage`.

- [ ] **Step 2: Write the workload identity manifest**

Use:

```yaml
platform: Azure Kubernetes Service
incidentType: Workload identity authentication failure
costProfile: high
guide: README.md
setup: { bash: scripts/setup.sh, powershell: scripts/setup.ps1 }
inject: { bash: scripts/inject.sh, powershell: scripts/inject.ps1 }
validate: { bash: scripts/validate.sh, powershell: scripts/validate.ps1 }
cleanup: { bash: scripts/cleanup.sh, powershell: scripts/cleanup.ps1 }
signal:
  alertModule: infra/bicep/modules/alert.bicep
  alertName: workload-identity-auth-errors
remediate:
  - action: restore-federated-credential
    bash: scripts/remediate.sh
    powershell: scripts/remediate.ps1
    description: Recreate the federated identity credential binding the workshop-app ServiceAccount to the UAMI, and restart pods.
investigation: { query: investigation/query.kql }
source: src/app
```

Keep the current ID, title, summary, severity, duration, difficulty, and objectives.

- [ ] **Step 3: Commit manifests**

```bash
git add scenarios/*/scenario.yaml
git commit -m "feat: define aks capsule manifests"
```

### Task 3: Wire one alert per AKS capsule

**Files:**
- Modify: `scenarios/cosmos-rbac-removal/infra/bicep/main.bicep`
- Modify: `scenarios/workload-identity-break/infra/bicep/main.bicep`

- [ ] **Step 1: Replace the generated aggregator in both entry points**

Use:

```bicep
module scenarioAlert 'modules/alert.bicep' = {
  name: 'scenario-alert'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    scopeResourceId: aks.outputs.clusterId
  }
}
```

Update comments from “workshop” and “per-scenario alerts” to the capsule's scenario title.

- [ ] **Step 2: Build both entry points**

```bash
for id in cosmos-rbac-removal workload-identity-break; do
  az bicep build --file "scenarios/$id/infra/bicep/main.bicep" --stdout > /dev/null
done
```

Expected: both builds exit 0.

- [ ] **Step 3: Commit direct alert wiring**

```bash
git add scenarios/*/infra/bicep
git commit -m "refactor: wire aks alerts per scenario"
```

### Task 4: Make image publishing and application deployment scenario-specific

**Files:**
- Create: `.github/workflows/publish-cosmos-rbac-removal-image.yml`
- Create: `.github/workflows/publish-workload-identity-break-image.yml`
- Create: `.github/workflows/deploy-cosmos-rbac-removal-app.yml`
- Create: `.github/workflows/deploy-workload-identity-break-app.yml`
- Modify: `scenarios/*/k8s/deployment.yaml`

- [ ] **Step 1: Give each image an explicit substitution token**

In each deployment manifest use:

```yaml
image: ghcr.io/IMAGE_REPOSITORY/app:latest
```

- [ ] **Step 2: Create one publish workflow per capsule**

For `cosmos-rbac-removal`, use:

```yaml
name: Publish Cosmos RBAC Removal Image
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths: ['scenarios/cosmos-rbac-removal/src/**']
```

Build context:

```yaml
context: scenarios/cosmos-rbac-removal/src/app
tags: |
  ghcr.io/${{ steps.repo.outputs.name }}/cosmos-rbac-removal/app:latest
  ghcr.io/${{ steps.repo.outputs.name }}/cosmos-rbac-removal/app:${{ github.sha }}
```

Repeat with `workload-identity-break`.

- [ ] **Step 3: Create one deployment workflow per capsule**

Copy the current AKS application deployment workflow, then set the manifest root and image
replacement:

```bash
SCENARIO_ROOT="scenarios/cosmos-rbac-removal"
IMAGE_REPOSITORY="$(echo "${{ github.repository }}/cosmos-rbac-removal" | tr '[:upper:]' '[:lower:]')"
sed -e "s|\${COSMOSDB_ENDPOINT}|${COSMOSDB_ENDPOINT}|g" \
    -e "s|IMAGE_REPOSITORY|${IMAGE_REPOSITORY}|g" \
    "$SCENARIO_ROOT/k8s/deployment.yaml" | kubectl apply -f -
```

Repeat with `workload-identity-break`.

- [ ] **Step 4: Commit application workflows**

```bash
git add .github/workflows scenarios/*/k8s/deployment.yaml
git commit -m "ci: deploy aks applications per scenario"
```

### Task 5: Create scenario-specific infrastructure workflows and devcontainers

**Files:**
- Create: `.github/workflows/validate-cosmos-rbac-removal-infra.yml`
- Create: `.github/workflows/validate-workload-identity-break-infra.yml`
- Create: `.github/workflows/deploy-cosmos-rbac-removal-infra.yml`
- Create: `.github/workflows/deploy-workload-identity-break-infra.yml`
- Create: `.devcontainer/cosmos-rbac-removal/devcontainer.json`
- Create: `.devcontainer/workload-identity-break/devcontainer.json`

- [ ] **Step 1: Duplicate and repath infrastructure workflows**

Each validation workflow watches and builds only:

```text
scenarios/<id>/infra/**
scenarios/<id>/infra/bicep/main.bicep
scenarios/<id>/infra/bicep/main.bicepparam
```

Each deployment workflow uses tags:

```bash
--tags scenario=<id> environment=demo
```

- [ ] **Step 2: Create devcontainers**

Use the current AKS feature set and set:

```json
"name": "SRE Scenario — Cosmos RBAC Removal",
"postCreateCommand": "npm --prefix scripts/scenario-tools ci && npm --prefix scenarios/cosmos-rbac-removal/src/app ci"
```

Create the equivalent workload identity configuration.

- [ ] **Step 3: Commit infrastructure entry points**

```bash
git add .github/workflows .devcontainer
git commit -m "ci: validate and deploy aks capsules"
```

### Task 6: Repath AKS docs and validate both capsules

**Files:**
- Modify: `scenarios/cosmos-rbac-removal/**/*.md`
- Modify: `scenarios/workload-identity-break/**/*.md`
- Modify: `scenarios/*/scripts/*`

- [ ] **Step 1: Replace old paths**

For each capsule, replace `workshops/aks/` with `scenarios/<id>/`. Replace learner-facing
“choose the AKS track” text with direct scenario instructions.

- [ ] **Step 2: Install and test both Node applications**

```bash
for id in cosmos-rbac-removal workload-identity-break; do
  npm --prefix "scenarios/$id/src/app" ci
  npm --prefix "scenarios/$id/src/app" test --if-present
done
```

Expected: installs succeed; any declared tests pass.

- [ ] **Step 3: Validate manifests and generated catalog**

```bash
scripts/validate-scenarios.sh --write
npm --prefix scripts/scenario-tools test
```

- [ ] **Step 4: Confirm no capsule references the AKS workshop**

```bash
rg -n 'workshops/aks|AKS track' scenarios/cosmos-rbac-removal scenarios/workload-identity-break || true
```

Expected: no matches.

- [ ] **Step 5: Commit documentation and generated catalog**

```bash
git add scenarios/cosmos-rbac-removal scenarios/workload-identity-break README.md
git commit -m "docs: make aks scenarios self-contained"
```
