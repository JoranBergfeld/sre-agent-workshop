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
- Permission to register Azure resource providers in the workshop subscription
  when they are not already registered. Setup requires `Microsoft.Web`,
  `Microsoft.Insights`, and `Microsoft.OperationalInsights`.
- When rerunning setup over an older deployment that still has the former
  GitHub deployment identity, **Owner** or **User Access Administrator** is
  required once to remove its legacy role assignment. A fresh deployment does
  not need role-assignment permission.
- Access to create or use an [Azure SRE Agent](https://sre.azure.com).
- GitHub Copilot coding agent enabled and assignable in the generated
  repository.
- Permission to connect that repository through the SRE Agent GitHub
  integrations.
- For public repositories, CodeQL is available for free. For a private or internal
  participant-owned repository, enable GitHub Code Security, historically part
  of GitHub Advanced Security, so the
  workshop's CodeQL workflow can upload results.

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

### Azure resource providers

Check the registration state before setup:

```bash
for provider in Microsoft.Web Microsoft.Insights Microsoft.OperationalInsights; do
  az provider show --namespace "$provider" --query registrationState -o tsv
done
```

```powershell
@("Microsoft.Web", "Microsoft.Insights", "Microsoft.OperationalInsights") |
  ForEach-Object {
    az provider show --namespace $_ --query registrationState -o tsv
  }
```

`Registered` is ready. Setup registers a missing provider and waits for it to
complete, so the signed-in identity must be allowed to register providers in
the subscription.

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

Use `swedencentral` for workshop deployments. It is the recommended region
after participants encountered quota constraints in other supported regions.
If Sweden Central is unavailable for your subscription, use one of these
supported alternatives:

- `eastus2`
- `australiaeast`

## Readiness checklist

- [ ] The current clone is the repository created with **Use this template**.
- [ ] `az account show` returns the intended subscription.
- [ ] `gh auth status` succeeds for the active GitHub credential.
- [ ] `dotnet --version` reports 10.x.
- [ ] `uv --version` reports a version when you plan to run local changed-line coverage.
- [ ] Your Azure CLI identity has Contributor access to the scenario resource group.
- [ ] `Microsoft.Web`, `Microsoft.Insights`, and
      `Microsoft.OperationalInsights` are registered, or your identity can
      register them.
- [ ] You selected the recommended `swedencentral` region, or confirmed quota
      in another supported region.
- [ ] For an older deployment only, you can remove its legacy role assignment
      or will delete the old resource group before rerunning setup.
- [ ] Copilot coding agent and SRE Agent access are available.
- [ ] CodeQL is available for the repository: public, or private/internal with
      GitHub Code Security enabled.

Next: [Deploy infrastructure and the starting app](./01-deploy-infrastructure.md).
