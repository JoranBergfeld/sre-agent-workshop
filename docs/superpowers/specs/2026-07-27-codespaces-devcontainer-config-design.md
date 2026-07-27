# Design — Codespaces Dev Container Configuration

Add GitHub Codespaces support to the repo via **per-track Dev Container configurations**, so a
workshop attendee can spin up a cloud dev environment preloaded with exactly the toolchain their
chosen track (`aks`, `vm`, or `appservice`) needs to run the labs end-to-end.

## Problem & Goal

The repo has no `.devcontainer/`, so opening it in Codespaces yields a bare image missing the
workshop toolchain (Azure CLI + Bicep, kubectl, PowerShell, .NET 10, Node, gh, jq). Attendees would
have to install everything by hand before they can inject scenarios, deploy Bicep, or run the
GitOps remediation flow.

**Goal:** ship ready-to-use Codespaces configs so that "Create Codespace" gives an attendee a
working environment for their track with zero manual tool installation.

## Scope & decomposition

- **In scope:** three `devcontainer.json` files (one per existing track), each composing official
  Dev Container Features, VS Code extensions, and a `postCreate` step that installs repo
  dependencies. Track-scoped so the Codespaces creation picker offers a clear choice.
- **Out of scope (YAGNI / non-goals):**
  - A single "kitchen-sink" container running all three tracks at once (rejected: attendee chose
    per-track).
  - Docker-in-Docker / local image builds — the AKS app image is built by `publish-aks-image.yml`
    in CI, not locally.
  - Baking in Azure/GitHub credentials — auth stays interactive (`az login`, `gh auth login`).
  - Repo-level **prebuild** config (that lives in GitHub repo settings, not in `devcontainer.json`);
    called out as an optional follow-up, not built here.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Layout | **Per-track** `.devcontainer/<track>/devcontainer.json` (`aks`, `vm`, `appservice`) | Codespaces creation flow lets the attendee pick the config; each image carries only its track's tools. |
| Build strategy | **Base image + official Dev Container Features** on `mcr.microsoft.com/devcontainers/base:ubuntu` | Version-pinnable, independently maintained; installs bleeding tools (.NET 10) cleanly; readable/maintainable vs. a monolithic Dockerfile. |
| Node | `features/node` @ 20 in **all three** | scenario-tools (`scripts/scenario-tools`, ESM) validate/generate is shared framework tooling; AKS app also needs it. |
| Azure CLI + Bicep | `features/azure-cli` with `installBicep: true`, all three | 27 `.bicep` files; deploy + `what-if` across every track. |
| PowerShell | `features/powershell`, all three | Every scenario ships a `.ps1` alongside `.sh`; VM tools are PowerShell too. |
| GitHub CLI | `features/github-cli`, all three | Core to the issue → `@copilot` PR GitOps remediation flow. |
| jq | apt install in `onCreateCommand`, all three | Used by `scripts/validate-scenarios.sh` and scenario scripts; not guaranteed in base image. |
| kubectl | `features/kubectl-helm-minikube` (kubectl only; helm/minikube `none`) — **aks only** | AKS track applies `workshops/aks/k8s/*.yaml`. |
| .NET SDK | `features/dotnet` @ `10.0` — **appservice only** | `Shop.csproj` targets `net10.0`, `global.json` pins `10.0.100`. |
| Credentials | Interactive at runtime | No secrets in the repo/image; matches the manual-deploy, human-in-the-loop workshop model. |

## Architecture

### Structure
```
.devcontainer/
├── aks/devcontainer.json
├── vm/devcontainer.json
└── appservice/devcontainer.json
```

### Per-track tool & config matrix

| | **aks** | **vm** | **appservice** |
|---|---|---|---|
| Base image | `base:ubuntu` | `base:ubuntu` | `base:ubuntu` |
| Common features | node20, azure-cli(+bicep), powershell, github-cli | same | same |
| Extra features | kubectl | — | dotnet 10.0 |
| jq | onCreate apt | onCreate apt | onCreate apt |
| postCreate | `npm ci` scenario-tools + `npm ci` `src/app` | `npm ci` scenario-tools | `npm ci` scenario-tools + `dotnet restore src` |
| forwardPorts | 3000 (Express app) | — | 5000 (Kestrel) |
| hostRequirements | cpus 4 | default | cpus 4 |
| name | "SRE Workshop — AKS" | "SRE Workshop — VM" | "SRE Workshop — App Service" |

### VS Code extensions

- **Common (all three):** `ms-azuretools.vscode-bicep`, `ms-vscode.azurecli`,
  `ms-vscode.powershell`, `github.vscode-github-actions`, `redhat.vscode-yaml`,
  `github.copilot`, `github.copilot-chat`.
- **aks adds:** `ms-kubernetes-tools.vscode-kubernetes-tools`, `dbaeumer.vscode-eslint`.
- **appservice adds:** `ms-dotnettools.csdevkit`.

### `postCreateCommand` notes

- Both `scripts/scenario-tools` and `workshops/aks/src/app` have committed `package-lock.json` →
  use `npm ci` (reproducible) for both.
- Exact command form: run each install with an explicit working dir (e.g. `npm --prefix <dir> ci` or
  a `cd … && …` chain) so it resolves regardless of the Codespace's initial CWD.

## Verification / acceptance

- Each `devcontainer.json` is valid JSON (JSONC comments allowed) and references only real,
  currently-published Feature and extension IDs.
- Feature option names (`installBicep`, dotnet `version`, kubectl-helm-minikube toggles) are checked
  against the features' published schemas at implementation time.
- Acceptance: a Codespace created from each config builds and lands with the track's tools on
  `PATH` (`az`, `bicep`, `pwsh`, `gh`, `jq`, plus `kubectl` on aks / `dotnet` on appservice), and
  `scripts/validate-scenarios.sh` runs. Full build is validated in Codespaces (Docker not assumed in
  this local environment).

## Documentation touchpoints

- Add a short "Open in Codespaces" note to `README.md` (and/or per-track `workshops/<track>/README.md`)
  pointing attendees at the track picker. Kept minimal; not a new doc page.
