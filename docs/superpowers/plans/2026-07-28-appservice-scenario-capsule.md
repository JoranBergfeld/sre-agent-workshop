# App Service Scenario Capsule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the App Service handover into `scenarios/cloud-agent-handover/` as a complete standalone capsule.

**Architecture:** Preserve the .NET 10 application, OIDC deployment, SRE Agent knowledge, and Copilot handover behavior while moving every deployable asset beneath the scenario. The scenario Bicep entry point calls its alert module directly instead of a generated track aggregator.

**Tech Stack:** .NET 10 Blazor, xUnit, Bicep, Bash, PowerShell, GitHub Actions OIDC.

---

### Task 1: Move tracked App Service assets into the capsule

**Files:**
- Move: `scenarios/cloud-agent-handover/**`
- Create: `scenarios/cloud-agent-handover/**`

- [ ] **Step 1: Create the target directories**

```bash
mkdir -p scenarios/cloud-agent-handover/{infra/bicep/modules,investigation,scripts}
```

- [ ] **Step 2: Move platform assets**

```bash
git mv scenarios/cloud-agent-handover/CODE_QUALITY.md scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/docs scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/infra/bicep/main.bicep scenarios/cloud-agent-handover/infra/bicep/
git mv scenarios/cloud-agent-handover/infra/bicep/main.bicepparam scenarios/cloud-agent-handover/infra/bicep/
git mv scenarios/cloud-agent-handover/infra/bicep/modules/appservice.bicep scenarios/cloud-agent-handover/infra/bicep/modules/
git mv scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep scenarios/cloud-agent-handover/infra/bicep/modules/
git mv scenarios/cloud-agent-handover/infra/bicep/modules/monitoring.bicep scenarios/cloud-agent-handover/infra/bicep/modules/
git mv scenarios/cloud-agent-handover/knowledge scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/scripts/* scenarios/cloud-agent-handover/scripts/
git mv scenarios/cloud-agent-handover/src scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/tests scenarios/cloud-agent-handover/
```

- [ ] **Step 3: Move scenario-owned assets into their final locations**

```bash
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/README.md scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/scenario.yaml scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/sample-issue.md scenarios/cloud-agent-handover/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/query.kql scenarios/cloud-agent-handover/investigation/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/alert.bicep scenarios/cloud-agent-handover/infra/bicep/modules/alert.bicep
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh scenarios/cloud-agent-handover/scripts/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.ps1 scenarios/cloud-agent-handover/scripts/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh scenarios/cloud-agent-handover/scripts/
git mv scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.ps1 scenarios/cloud-agent-handover/scripts/
git rm scenarios/cloud-agent-handover/README.md scenarios/cloud-agent-handover/scenarios/INDEX.md scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep
```

- [ ] **Step 4: Confirm the capsule contains only tracked source assets**

```bash
git status --short
git ls-files scenarios/cloud-agent-handover | sort
```

Expected: source, tests, docs, infra, knowledge, and scripts are present; `bin/`, `obj/`, and
`TestResults/` are absent.

- [ ] **Step 5: Commit the move**

```bash
git add -A
git commit -m "refactor: move app service into scenario capsule"
```

### Task 2: Convert the App Service manifest and Bicep entry point

**Files:**
- Modify: `scenarios/cloud-agent-handover/scenario.yaml`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/main.bicep`

- [ ] **Step 1: Replace the manifest**

```yaml
id: cloud-agent-handover
title: SRE Agent to Copilot Handover
platform: Azure App Service
incidentType: Application HTTP 500
summary: Blazor app ships one unfinished endpoint; button burst 500 alerts SRE Agent; after learner approval issue assigned to Copilot.
severity: 2
estimatedMinutes: 20
difficulty: beginner
costProfile: low
learningObjectives:
  - Observe a route-specific HTTP 500 incident.
  - Approve a structured issue handoff from the SRE Agent to Copilot.
  - Merge the Cloud Agent pull request and use the OIDC deployment to recover.
guide: README.md
setup:
  bash: scripts/setup.sh
  powershell: scripts/setup.ps1
inject:
  bash: scripts/inject.sh
  powershell: scripts/inject.ps1
validate:
  bash: scripts/validate.sh
  powershell: scripts/validate.ps1
cleanup:
  bash: scripts/cleanup.sh
  powershell: scripts/cleanup.ps1
signal:
  alertModule: infra/bicep/modules/alert.bicep
  alertName: unfinished-feature-5xx
investigation:
  query: investigation/query.kql
source: src
tests: tests
```

- [ ] **Step 2: Wire the alert directly**

Replace the `scenarioAlerts` module with:

```bicep
module scenarioAlert 'modules/alert.bicep' = {
  name: 'cloud-agent-handover-alert'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    scopeResourceId: monitoring.outputs.logAnalyticsId
  }
}
```

- [ ] **Step 3: Build Bicep**

```bash
az bicep build --file scenarios/cloud-agent-handover/infra/bicep/main.bicep --stdout > /dev/null
```

Expected: exit 0.

- [ ] **Step 4: Commit the capsule contract**

```bash
git add scenarios/cloud-agent-handover/scenario.yaml scenarios/cloud-agent-handover/infra/bicep/main.bicep
git commit -m "feat: make app service scenario independently deployable"
```

### Task 3: Repath App Service scripts, docs, and instructions

**Files:**
- Modify: `scenarios/cloud-agent-handover/**/*.md`
- Modify: `scenarios/cloud-agent-handover/scripts/*`
- Modify: `.github/instructions/appservice.instructions.md`
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Find stale paths**

```bash
rg -n 'scenarios/cloud-agent-handover|App Service track|workshop track' \
  scenarios/cloud-agent-handover .github/instructions/appservice.instructions.md .github/copilot-instructions.md
```

- [ ] **Step 2: Apply exact path replacements**

Use:

```text
scenarios/cloud-agent-handover/src        -> scenarios/cloud-agent-handover/src
scenarios/cloud-agent-handover/tests      -> scenarios/cloud-agent-handover/tests
scenarios/cloud-agent-handover/infra      -> scenarios/cloud-agent-handover/infra
scenarios/cloud-agent-handover/scripts    -> scenarios/cloud-agent-handover/scripts
scenarios/cloud-agent-handover/docs       -> scenarios/cloud-agent-handover/docs
scenarios/cloud-agent-handover/knowledge  -> scenarios/cloud-agent-handover/knowledge
```

Set the instruction frontmatter to:

```yaml
---
applyTo: "scenarios/cloud-agent-handover/**"
---
```

Keep the exact fixed API response and `/health` requirements unchanged.

- [ ] **Step 3: Update `sample-issue.md` scope**

The issue must permit changes only under:

```text
scenarios/cloud-agent-handover/src/**
scenarios/cloud-agent-handover/tests/**
```

- [ ] **Step 4: Confirm no stale App Service paths**

```bash
rg -n 'scenarios/cloud-agent-handover' scenarios/cloud-agent-handover .github || true
```

Expected: no matches in App Service docs, scripts, instructions, or workflows after Task 4.

- [ ] **Step 5: Commit path updates**

```bash
git add scenarios/cloud-agent-handover .github/instructions/appservice.instructions.md .github/copilot-instructions.md
git commit -m "docs: repath app service scenario guidance"
```

### Task 4: Retarget App Service workflows and devcontainer

**Files:**
- Modify: `.github/workflows/validate-appservice-app.yml`
- Modify: `.github/workflows/validate-appservice-infra.yml`
- Modify: `.github/workflows/deploy-appservice-app.yml`
- Move: `.devcontainer/cloud-agent-handover/devcontainer.json`
- Create: `.devcontainer/cloud-agent-handover/devcontainer.json`

- [ ] **Step 1: Rename display names and path filters**

Use:

```yaml
name: Validate Cloud Agent Handover Application
```

```yaml
paths:
  - 'scenarios/cloud-agent-handover/src/**'
  - 'scenarios/cloud-agent-handover/tests/**'
  - '.github/workflows/validate-appservice-app.yml'
```

Use equivalent scenario paths for infra validation and deployment.

- [ ] **Step 2: Repath commands**

Use:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj --configuration Release --output publish
az bicep build --file scenarios/cloud-agent-handover/infra/bicep/main.bicep --stdout
```

Coverage results must use `scenarios/cloud-agent-handover/TestResults`.

- [ ] **Step 3: Rename and update the devcontainer**

```bash
mkdir -p .devcontainer/cloud-agent-handover
git mv .devcontainer/cloud-agent-handover/devcontainer.json .devcontainer/cloud-agent-handover/devcontainer.json
```

Set:

```json
"name": "SRE Scenario — Cloud Agent Handover",
"postCreateCommand": "npm --prefix scripts/scenario-tools ci && dotnet restore scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj"
```

- [ ] **Step 4: Commit workflow changes**

```bash
git add .github/workflows .devcontainer
git commit -m "ci: target cloud agent handover capsule"
```

### Task 5: Validate the standalone App Service capsule

**Files:**
- Test: `scenarios/cloud-agent-handover/tests/EndpointTests.cs`
- Test: `scripts/scenario-tools/test/**`

- [ ] **Step 1: Run application tests**

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

Expected: all tests pass, including `/health` and the current unfinished feature behavior.

- [ ] **Step 2: Publish**

```bash
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj --configuration Release --output /tmp/cloud-agent-handover-publish
```

Expected: publish succeeds.

- [ ] **Step 3: Run scenario framework checks**

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Expected during the sequential migration: framework tests pass; full validation becomes
green after all seven legacy manifests have moved.

- [ ] **Step 4: Commit generated catalog changes**

```bash
git add README.md
git commit -m "docs: add cloud agent handover to scenario catalog"
```

