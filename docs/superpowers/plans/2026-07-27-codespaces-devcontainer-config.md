# Codespaces Dev Container Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Codespaces support via three per-track Dev Container configs (`aks`, `vm`, `appservice`) so an attendee gets a ready-to-use environment for their chosen track.

**Architecture:** Each `.devcontainer/<track>/devcontainer.json` starts from `mcr.microsoft.com/devcontainers/base:ubuntu` and composes official Dev Container Features. A common baseline (Node 20, Azure CLI+Bicep, PowerShell, GitHub CLI, jq) is shared by all three; `aks` adds kubectl, `appservice` adds .NET 10. `postCreateCommand` installs repo dependencies.

**Tech Stack:** Dev Container Features, Node.js 20, Azure CLI + Bicep, kubectl, PowerShell, .NET SDK 10, GitHub CLI, jq.

**Spec:** `docs/superpowers/specs/2026-07-27-codespaces-devcontainer-config-design.md`

**Conventions:**
- Files are written as **pure JSON** (no comments) so `node`/`jq` can validate them directly.
- Validation in this repo/host uses `node` (guaranteed present); the full container build is validated in Codespaces, not locally.
- Commit style follows the repo: `feat(codespaces): …`, `docs(codespaces): …`. Every commit includes the trailers shown in Task steps.

---

### Task 1: VM dev container (baseline template)

The VM track needs only the common baseline. This file establishes the pattern the other two extend.

**Files:**
- Create: `.devcontainer/vm/devcontainer.json`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p .devcontainer/vm`

- [ ] **Step 2: Create `.devcontainer/vm/devcontainer.json`**

```json
{
  "name": "SRE Workshop — VM",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/azure-cli:1": { "installBicep": true },
    "ghcr.io/devcontainers/features/powershell:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "onCreateCommand": "sudo apt-get update && sudo apt-get install -y jq",
  "postCreateCommand": "npm --prefix scripts/scenario-tools ci",
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-bicep",
        "ms-vscode.azurecli",
        "ms-vscode.powershell",
        "github.vscode-github-actions",
        "redhat.vscode-yaml",
        "github.copilot",
        "github.copilot-chat"
      ]
    }
  }
}
```

- [ ] **Step 3: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('.devcontainer/vm/devcontainer.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add .devcontainer/vm/devcontainer.json
git commit -m "feat(codespaces): add VM track dev container

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Copilot-Session: 7db6f26c-4ec9-43c6-b2d8-48f3f065fd8e"
```

---

### Task 2: AKS dev container

Baseline + kubectl (for `workshops/aks/k8s/*.yaml`) + Node app dependencies + port 3000 (Express app).

**Files:**
- Create: `.devcontainer/aks/devcontainer.json`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p .devcontainer/aks`

- [ ] **Step 2: Create `.devcontainer/aks/devcontainer.json`**

```json
{
  "name": "SRE Workshop — AKS",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/azure-cli:1": { "installBicep": true },
    "ghcr.io/devcontainers/features/powershell:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/kubectl-helm-minikube:1": { "helm": "none", "minikube": "none" }
  },
  "onCreateCommand": "sudo apt-get update && sudo apt-get install -y jq",
  "postCreateCommand": "npm --prefix scripts/scenario-tools ci && npm --prefix workshops/aks/src/app ci",
  "forwardPorts": [3000],
  "hostRequirements": { "cpus": 4 },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-bicep",
        "ms-vscode.azurecli",
        "ms-vscode.powershell",
        "github.vscode-github-actions",
        "redhat.vscode-yaml",
        "github.copilot",
        "github.copilot-chat",
        "ms-kubernetes-tools.vscode-kubernetes-tools",
        "dbaeumer.vscode-eslint"
      ]
    }
  }
}
```

- [ ] **Step 3: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('.devcontainer/aks/devcontainer.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add .devcontainer/aks/devcontainer.json
git commit -m "feat(codespaces): add AKS track dev container

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Copilot-Session: 7db6f26c-4ec9-43c6-b2d8-48f3f065fd8e"
```

---

### Task 3: App Service dev container

Baseline + .NET SDK 10 (`Shop.csproj` targets `net10.0`, `global.json` pins `10.0.100`) + `dotnet restore` + port 5000 (Kestrel default).

**Files:**
- Create: `.devcontainer/cloud-agent-handover/devcontainer.json`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p .devcontainer/cloud-agent-handover`

- [ ] **Step 2: Create `.devcontainer/cloud-agent-handover/devcontainer.json`**

```json
{
  "name": "SRE Workshop — App Service",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "20" },
    "ghcr.io/devcontainers/features/azure-cli:1": { "installBicep": true },
    "ghcr.io/devcontainers/features/powershell:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/dotnet:2": { "version": "10.0" }
  },
  "onCreateCommand": "sudo apt-get update && sudo apt-get install -y jq",
  "postCreateCommand": "npm --prefix scripts/scenario-tools ci && dotnet restore scenarios/cloud-agent-handover/src/Shop.csproj",
  "forwardPorts": [5000],
  "hostRequirements": { "cpus": 4 },
  "customizations": {
    "vscode": {
      "extensions": [
        "ms-azuretools.vscode-bicep",
        "ms-vscode.azurecli",
        "ms-vscode.powershell",
        "github.vscode-github-actions",
        "redhat.vscode-yaml",
        "github.copilot",
        "github.copilot-chat",
        "ms-dotnettools.csdevkit"
      ]
    }
  }
}
```

- [ ] **Step 3: Validate the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('.devcontainer/cloud-agent-handover/devcontainer.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add .devcontainer/cloud-agent-handover/devcontainer.json
git commit -m "feat(codespaces): add App Service track dev container

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Copilot-Session: 7db6f26c-4ec9-43c6-b2d8-48f3f065fd8e"
```

---

### Task 4: Add "Open in Codespaces" note to the root README

Point attendees at the track picker. Insert a new section between the "Choose a track" loop paragraph and "## Scenarios at a glance".

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Insert the Codespaces section**

Find this block in `README.md`:

```markdown
Each track follows the same loop: **deploy from code → inject a realistic fault →
watch the agent investigate → apply controlled remediation → capture a postmortem.**

## Scenarios at a glance
```

Replace it with:

```markdown
Each track follows the same loop: **deploy from code → inject a realistic fault →
watch the agent investigate → apply controlled remediation → capture a postmortem.**

## Open in Codespaces

You can run any track in a preconfigured [GitHub Codespace](https://docs.github.com/codespaces)
— no local tool installation required. Each track has its own dev container under
`.devcontainer/<track>/` bundling that track's toolchain (Azure CLI + Bicep, PowerShell,
GitHub CLI, Node, jq, plus kubectl for AKS or .NET 10 for App Service).

1. Click **Code → Codespaces → New with options…**
2. Under **Dev container configuration**, pick your track: **SRE Workshop — AKS**,
   **SRE Workshop — VM**, or **SRE Workshop — App Service**.
3. Create the Codespace and wait for setup to finish.

When it opens, authenticate the CLIs interactively with `az login` and `gh auth login`.

## Scenarios at a glance
```

- [ ] **Step 2: Verify the section was inserted exactly once**

Run: `grep -c "## Open in Codespaces" README.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(codespaces): add Open in Codespaces section to README

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Copilot-Session: 7db6f26c-4ec9-43c6-b2d8-48f3f065fd8e"
```

---

### Task 5: Final verification

Confirm all three configs are valid, feature IDs are consistent, and the tree is clean.

**Files:** none (verification only)

- [ ] **Step 1: Validate all three configs parse**

Run:
```bash
for t in vm aks appservice; do
  node -e "JSON.parse(require('fs').readFileSync('.devcontainer/$t/devcontainer.json','utf8')); console.log('$t valid')"
done
```
Expected:
```
vm valid
aks valid
appservice valid
```

- [ ] **Step 2: Confirm the shared baseline features appear in all three**

Run:
```bash
for f in node azure-cli powershell github-cli; do
  echo "$f: $(grep -l "features/$f:" .devcontainer/*/devcontainer.json | wc -l)"
done
```
Expected (each present in all 3):
```
node: 3
azure-cli: 3
powershell: 3
github-cli: 3
```

- [ ] **Step 3: Confirm track-specific features are scoped correctly**

Run:
```bash
grep -l "kubectl-helm-minikube" .devcontainer/*/devcontainer.json
grep -l "features/dotnet:" .devcontainer/*/devcontainer.json
```
Expected: kubectl only in `.devcontainer/aks/devcontainer.json`; dotnet only in `.devcontainer/cloud-agent-handover/devcontainer.json`.

- [ ] **Step 4: Confirm a clean working tree**

Run: `git status --porcelain`
Expected: empty output (all changes committed).

---

## Post-implementation acceptance (manual, in Codespaces)

Not part of the automated steps — validate once in GitHub Codespaces:

- Creating a Codespace from each config builds successfully.
- Tools resolve on `PATH`: `az`, `bicep`, `pwsh`, `gh`, `jq`, `node` in all; `kubectl` on aks; `dotnet --version` reports 10.x on appservice.
- `scripts/validate-scenarios.sh` prints `Scenario validation passed`.
