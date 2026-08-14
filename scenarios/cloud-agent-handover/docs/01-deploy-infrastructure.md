# Module 1: Run local setup

Run one setup script from the root of your generated repository. Setup is local;
there is no infrastructure deployment workflow to trigger.

## Bash

Use the defaults (`eastus2`, workload `srelabapp`):

```bash
scenarios/cloud-agent-handover/scripts/setup.sh
```

Or choose supported values:

```bash
scenarios/cloud-agent-handover/scripts/setup.sh \
  --location swedencentral \
  --workload myhandover
```

## PowerShell 7

Use the defaults:

```powershell
scenarios/cloud-agent-handover/scripts/setup.ps1
```

Or choose supported values:

```powershell
scenarios/cloud-agent-handover/scripts/setup.ps1 `
  -Location swedencentral `
  -Workload myhandover
```

## What setup does

The script:

1. Checks the required tools, Azure login, GitHub login, generated repository,
   and Copilot assignability.
2. Registers the required Azure resource providers.
3. Creates `rg-<workload>`.
4. Deploys a B1 Linux App Service, workspace-based Application Insights and Log
   Analytics, and the scenario alert.
5. Tests, publishes, and deploys the .NET 10 application with the signed-in
   Azure CLI user.
6. Writes repository metadata variables for the resource group, web app,
   location, and workload name.

At completion it prints values in this form:

```text
Application: https://<app-name>.azurewebsites.net
Health:      https://<app-name>.azurewebsites.net/health
Repository:  <owner>/<repository>
```

Save the application URL for later modules.

## Troubleshooting

### Source template rejected

If setup says the repository is still a template, return to GitHub, select
**Use this template**, clone the generated repository, and run setup in the
generated repository. Current setup output says:

`Use the template, clone the generated repository, and run setup in the generated repository.`

### Copilot is not assignable

Enable GitHub Copilot coding agent for the repository and confirm that your
account or organization policy permits issue assignment. Then rerun setup.

### GitHub Actions variables are denied

Setup uses the active GitHub CLI credential. In Codespaces, it preserves the
authenticated `GITHUB_TOKEN`; do not unset it. Run `gh auth status`, then
rerun setup. The active credential needs permission to manage Actions variables
in the generated repository.

### Provider registration fails

Inspect the required providers:

```bash
az provider show --namespace Microsoft.Web --query registrationState -o tsv
az provider show --namespace Microsoft.Insights --query registrationState -o tsv
az provider show --namespace Microsoft.OperationalInsights --query registrationState -o tsv
```

Register any provider that is not `Registered`:

```bash
az provider register --namespace <provider-name> --wait
```

Next: [Verify the application](./02-deploy-application.md).
