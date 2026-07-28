# VM Scenario Capsules and Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the VM workshop into four standalone capsules, preserve approval-gated remediation, then remove the workshop hierarchy and all track-first navigation.

**Architecture:** Each VM capsule owns a complete VM/IIS deployment and a capsule-local approval gate that resolves only remediation scripts listed under `scripts/remediation/`. Final cleanup repaths workflows and docs, removes legacy workshop assets, and validates exactly seven top-level scenarios.

**Tech Stack:** Azure VM/IIS, Bicep, Bash, PowerShell 7, Azure CLI, GitHub Actions, Node.js scenario tooling.

---

### Task 1: Copy the VM substrate into four capsules

**Files:**
- Copy from: `workshops/vm/**`
- Create: `scenarios/{cpu-runaway,disk-full,iis-app-pool,vm-size-retirement}/**`

- [ ] **Step 1: Create capsule directories**

```bash
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  mkdir -p "scenarios/$id"/{infra/bicep/modules,investigation,output,scripts/remediation,tests,tools}
done
```

- [ ] **Step 2: Copy shared VM assets**

```bash
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  cp -a workshops/vm/docs "scenarios/$id/"
  cp -a workshops/vm/infra/bicep/main.bicep "scenarios/$id/infra/bicep/"
  cp -a workshops/vm/infra/bicep/main.bicepparam "scenarios/$id/infra/bicep/"
  cp -a workshops/vm/infra/bicep/modules/{identity,monitoring,network,vm}.bicep \
    "scenarios/$id/infra/bicep/modules/"
  cp -a workshops/vm/scripts/access "scenarios/$id/scripts/"
  cp -a workshops/vm/scripts/validation "scenarios/$id/scripts/"
  cp workshops/vm/scripts/{setup,cleanup}.{sh,ps1} "scenarios/$id/scripts/"
  cp workshops/vm/tools/* "scenarios/$id/tools/"
  touch "scenarios/$id/output/.gitkeep"
done
```

- [ ] **Step 3: Copy each scenario's incident assets**

For each ID, copy `README.md`, `scenario.yaml`, `query.kql`, inject and validate pairs.
Copy remediation pairs into `scripts/remediation/`. For `vm-size-retirement`, also copy
`service-health-advisory.json` and `service-health-alert.bicep`.

- [ ] **Step 4: Preserve executability**

```bash
find scenarios/{cpu-runaway,disk-full,iis-app-pool,vm-size-retirement}/scripts \
  -type f -name '*.sh' -exec chmod +x {} +
chmod +x scenarios/{cpu-runaway,disk-full,iis-app-pool,vm-size-retirement}/tools/*.sh
```

- [ ] **Step 5: Commit copied capsules**

```bash
git add scenarios/cpu-runaway scenarios/disk-full scenarios/iis-app-pool scenarios/vm-size-retirement
git commit -m "refactor: create standalone vm scenario capsules"
```

### Task 2: Convert all four VM manifests

**Files:**
- Modify: `scenarios/*/scenario.yaml`

- [ ] **Step 1: Apply common capsule fields**

Each manifest uses:

```yaml
platform: Azure Virtual Machines
costProfile: high
guide: README.md
setup: { bash: scripts/setup.sh, powershell: scripts/setup.ps1 }
inject: { bash: scripts/inject.sh, powershell: scripts/inject.ps1 }
validate: { bash: scripts/validate.sh, powershell: scripts/validate.ps1 }
cleanup: { bash: scripts/cleanup.sh, powershell: scripts/cleanup.ps1 }
investigation: { query: investigation/query.kql }
```

Use incident types:

```text
cpu-runaway: Compute saturation
disk-full: Storage capacity
iis-app-pool: Web service availability
vm-size-retirement: Platform lifecycle advisory
```

- [ ] **Step 2: Repath remediation entries**

Use:

```text
scripts/remediation/stop-cpu-runaway.{sh,ps1}
scripts/remediation/cleanup-disk.{sh,ps1}
scripts/remediation/cleanup-temp.{sh,ps1}
scripts/remediation/start-iis-app-pool.{sh,ps1}
scripts/remediation/migrate-vm-size.{sh,ps1}
```

The first three manifests keep `signal.alertModule: infra/bicep/modules/alert.bicep`.
The retirement manifest has no runtime signal because its service-health Bicep remains a
documented production reference.

- [ ] **Step 3: Commit manifests**

```bash
git add scenarios/{cpu-runaway,disk-full,iis-app-pool,vm-size-retirement}/scenario.yaml
git commit -m "feat: define vm capsule manifests"
```

### Task 3: Add one scenario alert to each VM entry point

**Files:**
- Modify: `scenarios/*/infra/bicep/main.bicep`
- Create: `scenarios/{cpu-runaway,disk-full,iis-app-pool}/infra/bicep/modules/alert.bicep`

- [ ] **Step 1: Move alert modules into the three runtime-alert capsules**

Copy each existing `alert.bicep` to `infra/bicep/modules/alert.bicep`.

- [ ] **Step 2: Replace the generated aggregator**

For CPU, disk, and IIS use:

```bicep
module scenarioAlert 'modules/alert.bicep' = {
  name: 'scenario-alert'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    scopeResourceId: monitoring.outputs.logAnalyticsId
  }
}
```

For retirement, remove the aggregator module entirely and keep
`service-health-alert.bicep` as a standalone reference requiring `sreAgentWebhookUri`.

- [ ] **Step 3: Replace track tags**

Use:

```bicep
param tags object = {
  scenario: '<scenario-id>'
  environment: 'demo'
}
```

- [ ] **Step 4: Build all VM entry points and the reference alert**

```bash
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  az bicep build --file "scenarios/$id/infra/bicep/main.bicep" --stdout > /dev/null
done
az bicep build --file scenarios/vm-size-retirement/service-health-alert.bicep --stdout > /dev/null
```

Expected: all builds exit 0.

- [ ] **Step 5: Commit Bicep changes**

```bash
git add scenarios/*/infra scenarios/vm-size-retirement/service-health-alert.bicep
git commit -m "refactor: wire vm infrastructure per scenario"
```

### Task 4: Make the approval gate capsule-local and testable

**Files:**
- Modify: `scenarios/*/tools/invoke-approved-remediation.sh`
- Modify: `scenarios/*/tools/Invoke-ApprovedRemediation.ps1`
- Create: `scenarios/*/tests/approval-gate.test.sh`

- [ ] **Step 1: Write a failing Bash contract test in each capsule**

The test creates a temporary capsule tree, copies the gate, adds a dummy remediation script,
then asserts:

```bash
run_gate() {
  printf '%s\n' "$1" | "$TMP/tools/invoke-approved-remediation.sh" \
    --action test-action \
    --change-ticket CHG-12345 \
    --resource-group rg-test \
    --vm-name vm-test
}

run_gate APPROVE
grep -q '"ticket":"CHG-12345"' "$TMP/output/actions-audit.log"
grep -q '"action":"test-action"' "$TMP/output/actions-audit.log"

if "$TMP/tools/invoke-approved-remediation.sh" --action test-action --change-ticket BAD <<< APPROVE; then
  echo "invalid ticket unexpectedly succeeded" >&2
  exit 1
fi

if run_gate DENY; then
  echo "non-APPROVE input unexpectedly succeeded" >&2
  exit 1
fi
```

- [ ] **Step 2: Run and confirm failure**

```bash
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  bash "scenarios/$id/tests/approval-gate.test.sh"
done
```

Expected: FAIL because the copied gate still searches `../scenarios/*`.

- [ ] **Step 3: Repath Bash action resolution**

Use:

```bash
SCRIPT_PATH="$SCRIPT_DIR/../scripts/remediation/${ACTION}.sh"
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Unknown action '$ACTION': no scripts/remediation/${ACTION}.sh found." >&2
  exit 1
fi
```

Keep ticket validation, exact `APPROVE`, execution, and JSON audit behavior unchanged.

- [ ] **Step 4: Repath PowerShell action resolution**

Use:

```powershell
$scriptPath = Join-Path $PSScriptRoot "..\scripts\remediation\$Action.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Unknown action '$Action': no scripts\remediation\$Action.ps1 found."
}
```

- [ ] **Step 5: Run all approval-gate tests**

```bash
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  bash "scenarios/$id/tests/approval-gate.test.sh"
done
```

Expected: all four pass and verify ticket, approval, action execution, and audit output.

- [ ] **Step 6: Commit approval gates**

```bash
git add scenarios/*/tools scenarios/*/tests
git commit -m "test: preserve vm remediation approval gates"
```

### Task 5: Make investigation and lifecycle tooling scenario-local

**Files:**
- Modify: `scenarios/*/tools/invoke-vm-investigation.sh`
- Modify: `scenarios/*/tools/Invoke-VmInvestigation.ps1`
- Modify: `scenarios/*/scripts/**`
- Modify: `scenarios/*/README.md`
- Modify: `scenarios/*/docs/**`

- [ ] **Step 1: Remove the scenario selector**

Each investigation wrapper uses:

```bash
SCENARIO="<scenario-id>"
QUERY_FILE="$SCRIPT_DIR/../investigation/query.kql"
```

Remove `--scenario`, the allow-list help text, and paths through `../scenarios/$SCENARIO`.
Apply the equivalent PowerShell change.

- [ ] **Step 2: Repath postmortem commands**

Use:

```text
./tools/invoke-approved-remediation.sh --action <approved-action> ...
```

Output remains under the capsule's `output/`.

- [ ] **Step 3: Repath setup diagnostics**

Replace `workshops/vm/infra/...` suggestions with `scenarios/<id>/infra/...` in each setup
pair. Replace all learner commands and links similarly.

- [ ] **Step 4: Confirm capsule isolation**

```bash
rg -n 'workshops/vm|../scenarios|--scenario' \
  scenarios/cpu-runaway scenarios/disk-full scenarios/iis-app-pool scenarios/vm-size-retirement || true
```

Expected: no stale structural references.

- [ ] **Step 5: Commit tooling and docs**

```bash
git add scenarios/cpu-runaway scenarios/disk-full scenarios/iis-app-pool scenarios/vm-size-retirement
git commit -m "refactor: isolate vm scenario operations"
```

### Task 6: Create VM scenario workflows and devcontainers

**Files:**
- Create: `.github/workflows/validate-<id>-infra.yml`
- Create: `.github/workflows/deploy-<id>-infra.yml`
- Create: `.devcontainer/<id>/devcontainer.json`
- Delete later: `.github/workflows/validate-vm-infra.yml`
- Delete later: `.github/workflows/deploy-vm-infra.yml`

- [ ] **Step 1: Create one validation workflow per VM capsule**

Each workflow watches `scenarios/<id>/infra/**`, builds that capsule's `main.bicep`, and uses
its `main.bicepparam` for optional what-if.

- [ ] **Step 2: Create one deployment workflow per VM capsule**

Use the existing VM inputs and password checks. Set:

```bash
--template-file scenarios/<id>/infra/bicep/main.bicep
--parameters scenarios/<id>/infra/bicep/main.bicepparam
--tags scenario=<id> environment=demo
```

The final summary links directly to `scenarios/<id>/README.md`.

- [ ] **Step 3: Create four devcontainers**

Use the current VM feature set and names such as:

```json
"name": "SRE Scenario — CPU Runaway",
"postCreateCommand": "npm --prefix scripts/scenario-tools ci"
```

- [ ] **Step 4: Commit workflow entry points**

```bash
git add .github/workflows .devcontainer
git commit -m "ci: deploy and validate vm scenarios"
```

### Task 7: Remove legacy workflows, devcontainers, and workshops

**Files:**
- Delete: `workshops/**`
- Delete: old track-qualified workflows
- Delete: `.devcontainer/{appservice,aks,vm}/**`

- [ ] **Step 1: Remove superseded workflows**

```bash
git rm \
  .github/workflows/deploy-aks-app.yml \
  .github/workflows/deploy-aks-infra.yml \
  .github/workflows/deploy-vm-infra.yml \
  .github/workflows/publish-aks-image.yml \
  .github/workflows/validate-aks-infra.yml \
  .github/workflows/validate-vm-infra.yml
```

Remove App Service workflow files only if earlier plans renamed their filenames rather than
only their display names.

- [ ] **Step 2: Remove superseded devcontainers**

```bash
git rm -r .devcontainer/appservice .devcontainer/aks .devcontainer/vm
```

- [ ] **Step 3: Remove the workshop hierarchy**

```bash
git rm -r workshops
```

- [ ] **Step 4: Commit structural deletion**

```bash
git add -A
git commit -m "refactor: remove workshop hierarchy"
```

### Task 8: Rewrite root documentation and contributor instructions

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/01-why-sre-agent.md`
- Modify: `docs/02-how-it-works.md`
- Modify: `docs/connect-github-to-sre-agent.md`
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1: Rewrite the root learner flow**

The root README must:

1. Link shared concepts.
2. Present the generated seven-scenario catalog.
3. Explain scenario selection, Codespaces, cost, and cleanup without a workshop/track layer.
4. Describe `scenarios/<id>/` as the repository unit.

- [ ] **Step 2: Rewrite contribution guidance**

Document:

```bash
scripts/new-scenario.sh <id> "Title" --platform "Azure Service"
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Remove the “add a track” section. State that a new platform is introduced by a complete
scenario capsule.

- [ ] **Step 3: Repath concept docs and Copilot instructions**

Replace every `workshops/**` link with its scenario path. Remove learner-facing phrases that
ask users to choose a workshop or track. Platform names remain valid descriptive metadata.

- [ ] **Step 4: Generate the final catalog**

```bash
scripts/validate-scenarios.sh --write
```

Expected: exactly seven rows.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md CONTRIBUTING.md docs .github/copilot-instructions.md
git commit -m "docs: make scenarios the primary learner experience"
```

### Task 9: Final repository validation

**Files:**
- Test: all scenario capsules and workflows

- [ ] **Step 1: Run scenario tooling**

```bash
npm --prefix scripts/scenario-tools test
scripts/validate-scenarios.sh
```

Expected: all tests pass and output includes `Scenario validation passed`.

- [ ] **Step 2: Build every Bicep entry point**

```bash
for f in scenarios/*/infra/bicep/main.bicep; do
  az bicep build --file "$f" --stdout > /dev/null
done
az bicep build --file scenarios/vm-size-retirement/service-health-alert.bicep --stdout > /dev/null
```

- [ ] **Step 3: Run platform tests**

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
for id in cosmos-rbac-removal workload-identity-break; do
  npm --prefix "scenarios/$id/src/app" test --if-present
done
for id in cpu-runaway disk-full iis-app-pool vm-size-retirement; do
  bash "scenarios/$id/tests/approval-gate.test.sh"
done
```

- [ ] **Step 4: Prove the old hierarchy is gone**

```bash
test ! -d workshops
test "$(find scenarios -mindepth 2 -maxdepth 2 -name scenario.yaml | wc -l)" -eq 7
if rg -n 'workshops/|choose a track|add a track' \
  README.md CONTRIBUTING.md docs scenarios .github scripts schemas \
  --glob '!docs/superpowers/**'; then
  echo "stale workshop hierarchy references found" >&2
  exit 1
fi
```

Expected: exit 0 with no stale references.

- [ ] **Step 5: Check the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intended changes.
