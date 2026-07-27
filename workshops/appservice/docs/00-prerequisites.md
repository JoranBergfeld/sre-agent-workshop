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

The setup scripts reject the source template repository because the GitHub OIDC
trust must target your generated repository.

## Access

You need:

- An Azure subscription with **Contributor** at the workshop resource-group
  scope or broader.
- **Owner** or **User Access Administrator** at that scope or broader. The
  Bicep deployment creates a Website Contributor role assignment for the
  GitHub deployment identity; Contributor alone cannot create role
  assignments.
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
| Bash path | `zip` and `jq` |
| PowerShell path | PowerShell 7 |

Authenticate before running setup:

```bash
az login
gh auth login
gh auth refresh -s read:org,repo
```

The GitHub scopes required by your organization may vary with its policy.

## Supported regions

Choose one:

- `eastus2`
- `swedencentral`
- `australiaeast`

## Readiness checklist

- [ ] The current clone is the repository created with **Use this template**.
- [ ] `az account show` returns the intended subscription.
- [ ] `gh auth status` succeeds for the intended GitHub account.
- [ ] `dotnet --version` reports 10.x.
- [ ] You have role-assignment permission for the workshop resource group.
- [ ] Copilot coding agent and SRE Agent access are available.

Next: [Deploy infrastructure and the starting app](./01-deploy-infrastructure.md).
