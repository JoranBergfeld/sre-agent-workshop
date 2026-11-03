# Module 0: Prerequisites and integration checks

This scenario requires live Azure, Azure SRE Agent, Azure Boards, and GitHub
Copilot cloud agent access. There is no simulated or GitHub-only fallback.

## Facilitator-managed integration

Before a learner starts, a facilitator must provide:

- An Azure DevOps Services organization and project using a process that
  supports the **Bug** work-item type.
- The Azure Boards GitHub App installed for the workshop repository.
- The Azure DevOps project connected to that repository through **GitHub App
  authentication**. A PAT-backed repository connection does not support the
  Azure Boards Copilot action.
- GitHub Copilot cloud agent enabled by organization policy when the
  repository belongs to a Copilot Business or Enterprise organization.

The facilitator owns this shared connection. Learners must not remove it
during cleanup.

## Learner access

Confirm that you have:

- An Azure subscription where you can create a resource group, role
  assignments, Azure Functions, Service Bus, Storage, and monitoring
  resources.
- Permission to create and configure an Azure SRE Agent.
- Azure DevOps **Contributor** access to the workshop project.
- GitHub **Write** access to the connected repository.
- An active paid GitHub Copilot plan.
- Azure CLI, Git, `curl`, `jq`, Node.js 20+, authenticated GitHub CLI (`gh`),
  and PowerShell 7 when following the PowerShell path.
- A successful **Validate Azure Boards Copilot Handover Application** run in
  your own repository for the exact commit you will deploy. Pull-request runs
  never publish deployment packages. Use a push to `main` or manually dispatch
  the workflow on a branch/tag pointing to that commit, not a raw commit SHA.
- **Storage Blob Data Contributor** access for your deployment identity,
  scoped to the scenario storage account's private `application-packages`
  container. Have an authorized administrator grant this data-plane role
  after provisioning if it is not already inherited. Control-plane Contributor
  alone is insufficient. The Function identity receives only **Storage Blob
  Data Reader** at this container, through Bicep.

Sign in and select the intended subscription:

```bash
az login
az account show --query '{name:name,id:id}' --output table
```

```powershell
az login
az account show --query '{name:name,id:id}' --output table
```

## Region and build artifact

Setup prefers the region you pass and, for a new deployment, falls back
through `eastus2`, `swedencentral` and `australiaeast` when Linux Python
Functions, Service Bus, storage or monitoring are unavailable there. An
existing deployment stays in its region. By default the deploy step uses the
tested Linux Functions ZIP built for your exact commit by this repository's
build workflow; `--build-mode source` builds it locally instead. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md) and
[Exact-commit build artifacts](../../../docs/build-artifacts.md).

## Optional source-build and local review tools

The default deployment downloads and verifies the repo-built Linux Python 3.12
package. Python, pip, quality tools, and ZIP creation tools are not needed
locally for that path. No SAS, storage key, or public container is needed.

Install Python 3.12 and these quality tools only for local review or the explicit
`deploy.sh --build-mode source` / `deploy.ps1 --build-mode source` alternative.
The source path additionally needs `zip` on Bash (PowerShell uses
`Compress-Archive`). It runs the local baseline gates and uses remote Oryx
dependency installation; it is never an automatic fallback for a missing build.
Create the scenario-local virtual environment:

```bash
APP_DIR="scenarios/azure-boards-copilot-handover/app"
python3 -m venv "$APP_DIR/.venv"
"$APP_DIR/.venv/bin/python" -m pip install -r "$APP_DIR/requirements-dev.txt"
```

```powershell
$AppDir = "scenarios/azure-boards-copilot-handover/app"
python3 -m venv "$AppDir/.venv"
& "$AppDir/.venv/bin/python" -m pip install -r "$AppDir/requirements-dev.txt"
```

These paths target the Linux workshop and Codespaces environment. On native
Windows, use `.venv\Scripts\python.exe` instead.

Verify the tools:

```bash
"$APP_DIR/.venv/bin/ruff" --version
"$APP_DIR/.venv/bin/mypy" --version
"$APP_DIR/.venv/bin/pytest" --version
zip -v | head -1
```

```powershell
& "$AppDir/.venv/bin/ruff" --version
& "$AppDir/.venv/bin/mypy" --version
& "$AppDir/.venv/bin/pytest" --version
```

## Verify the Azure Boards Copilot action

In the connected Azure DevOps project:

1. Open an eligible existing Bug or create a temporary nonsensitive Bug.
2. Confirm the **Create a pull request with GitHub Copilot** action is visible.
3. Open the repository picker and confirm the workshop GitHub repository and
   `main` branch are available.
4. Cancel before starting Copilot. The operation cannot be cancelled after it
   starts.
5. Delete the temporary Bug if you created one.

Do not put secrets, personal information, access tokens, Function keys, or real
incident data in a work item. Content passed to Copilot can become visible in
the linked pull request.

Next: [Deploy the starting application](./01-deploy-starting-application.md).
