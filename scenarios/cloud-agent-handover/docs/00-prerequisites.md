# Module 0: Prerequisites

Complete these checks before starting the App Service handover.

## Create your repository

1. Open the source repository on GitHub.
2. Select **Use this template**, then create a new repository you control.
3. Clone that generated repository and enter its root directory:

   ```bash
   git clone https://github.com/<owner>/<repository>.git
   cd <repository>
   ```

The setup scripts reject the source template repository because the scenario
requires a generated repository that the SRE Agent and Copilot coding agent can
use for the approved handoff.

## Access

You need:

- An Azure subscription with **Contributor** at the scenario resource-group
  scope or broader. The signed-in Azure CLI user performs the initial and
  recovery deployments.
- Access to create or use an [Azure SRE Agent](https://sre.azure.com).
- GitHub Copilot coding agent enabled and assignable in the generated
  repository.
- Permission to connect that repository through the SRE Agent GitHub
  integrations.

## Tools

| Tool | Requirement |
| --- | --- |
| [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) | `az` |
| [GitHub CLI](https://cli.github.com/) | `gh` |
| [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) | `dotnet` 10.x |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | `uv` (only for local changed-line coverage; CI installs its own pinned `diff-cover` dependency) |
| Bash path | `zip` and `jq` |
| PowerShell path | PowerShell 7 |

Outside Codespaces, authenticate before running setup:

```bash
az login
gh auth login
gh auth refresh -s read:org,repo
```

Optionally pin every lifecycle command to an intended Azure subscription:

```bash
export AZURE_SUBSCRIPTION_ID="<subscription-id>"
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az account show --query '{name:name,id:id}' --output table
```

```powershell
$env:AZURE_SUBSCRIPTION_ID = "<subscription-id>"
az account set --subscription $env:AZURE_SUBSCRIPTION_ID
az account show --query '{name:name,id:id}' --output table
```

Setup also accepts `--subscription-id <subscription-id>` in Bash and
`-SubscriptionId <subscription-id>` in PowerShell. Lifecycle scripts verify
the active subscription and print its name and ID before Azure operations.

The GitHub scopes required by your organization may vary with its policy.

### Codespaces GitHub authentication

In Codespaces, setup uses the authenticated `GITHUB_TOKEN` supplied to GitHub
CLI. Do not unset `GH_TOKEN` or `GITHUB_TOKEN`. Confirm the active credential
before setup:

```bash
gh auth status
```

If you plan to reproduce the changed-line coverage gate locally, verify `uv`
in the shell you use:

```bash
uv --version
```

```powershell
uv --version
```

## Supported regions

Choose one:

- `eastus2`
- `swedencentral`
- `australiaeast`

## Readiness checklist

- [ ] The current clone is the repository created with **Use this template**.
- [ ] `az account show` returns the intended subscription.
- [ ] `gh auth status` succeeds for the active GitHub credential.
- [ ] `dotnet --version` reports 10.x.
- [ ] `uv --version` reports a version when you plan to run local changed-line coverage.
- [ ] Your Azure CLI identity has Contributor access to the scenario resource group.
- [ ] Copilot coding agent and SRE Agent access are available.

Next: [Deploy infrastructure and the starting app](./01-deploy-infrastructure.md).
