# Run the workshop from your own laptop

Every scenario's Codespace comes with the tools it needs already installed.
You can also run any scenario from macOS, Linux or Windows. This page covers
the problems people most often hit on personal and work laptops.

## Before you start

- **Clone the repository with git.** Setup uses build artifacts made from the
  exact commit you have checked out, so it cannot run from a ZIP download.
  Create your repository from the template, then `git clone` it.
- **Install the tools.** Every scenario needs:
  - Azure CLI with Bicep (`az bicep install`);
  - Node.js 20 or later (22 or later for App Service Latency Context);
  - GitHub CLI.

  Your scenario's `docs/00-prerequisites.md` lists anything else it needs,
  such as `kubectl` or `jq`.
- **Sign in to Azure and GitHub:**

  ```bash
  az login
  az account set --subscription "<subscription-id>"
  gh auth login
  gh auth refresh -s read:org,repo
  ```

## macOS

The built-in Bash 3.2 (`/bin/bash`) runs every script, so you don't need a
newer Bash. Install the tools with Homebrew or their own installers.

## Windows

- **Use PowerShell 7 (`pwsh`), not Windows PowerShell 5.1.** Under 5.1 the
  scripts stop and say they require PowerShell 7. Without administrator
  rights, `winget install --id Microsoft.PowerShell --source winget` installs
  a per-user package; the Microsoft Store and the ZIP package are
  alternatives. See
  [Install PowerShell on Windows](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows),
  then check `pwsh --version`.
- **Execution policy.** If PowerShell says running scripts is disabled, or that
  a script is not digitally signed, run `Get-ExecutionPolicy -List`:
  - if `MachinePolicy` and `UserPolicy` are `Undefined`, run
    `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`;
  - otherwise your organization sets the policy. Don't work around it; use WSL
    or a Codespace.
- **Bash scripts** run in WSL with the Linux versions of the tools. Clone the
  repository inside the Linux file system (for example under `~`), not under
  `/mnt/c`. If you use Git Bash instead, PowerShell 7 must still be installed;
  see [Region and VM-size fallback](region-and-sku-fallback.md).
- **`$'\r': command not found`** or **`bash\r: No such file or directory`**
  means your clone converted the scripts to Windows line endings. Clone the
  repository again; the repository keeps its scripts with Unix line endings.

## Corporate networks

- Allow outbound HTTPS to Azure, GitHub and `*.azuresre.ai`.
- Behind a proxy, set `HTTPS_PROXY` (and `NO_PROXY` for internal hosts) before
  you run a scenario. Azure CLI, GitHub CLI, git and curl all use it.
- If the proxy inspects TLS, point Azure CLI at a PEM bundle that includes your
  organization's root certificate with `REQUESTS_CA_BUNDLE`; see
  [Work behind a proxy](https://learn.microsoft.com/cli/azure/use-azure-cli-successfully-troubleshooting#work-behind-a-proxy).
  On Windows, `git config --global http.sslBackend schannel` makes git use the
  Windows certificate store.

## Work tenants and subscriptions

- **Tenant.** If your account belongs to several tenants, sign in with
  `az login --tenant <tenant-id>`. A Conditional Access error such as
  `AADSTS53003` means your tenant only allows sign-in from managed devices or
  locations. Use a device your organization manages, or a lab subscription.
- **Roles.** Most scenarios create role assignments, so you need Owner, or
  Contributor plus User Access Administrator (or Role Based Access Control
  Administrator). Your scenario's prerequisites give the scope. With
  Privileged Identity Management, activate the role first, then run
  `az login` again.
- **Resource providers.** Registering a provider needs access to the whole
  subscription. Without it, ask an administrator to run the
  `az provider register` command that setup prints.
- **Azure Policy.** A policy that denies a resource usually stops the
  deployment at validation, before anything is created. Common ones:
  - *Allowed locations* or *allowed virtual machine size SKUs*: setup falls
    back to another supported region or size, and stops when none is allowed.
  - *Required tags*: add your organization's tags when you create the resource
    group, next to `sre-workshop-scenario=<scenario-id>`.
  - *No public IP addresses or public endpoints*: the VM scenarios create
    public IP addresses, and the AKS scenarios need a public cluster.

  Otherwise, ask your administrator for an exemption on your resource group,
  or use a lab or personal subscription.
- **Quota.** Setup checks vCPU quota for the whole deployment before it starts.
  For example, the AKS scenarios need 12 vCPUs: two 4-vCPU nodes plus an
  upgrade surge node. Request more in **Azure portal > Quotas**.

When setup stops, follow its **What to do next** block.
[Region and VM-size fallback](region-and-sku-fallback.md#if-a-deployment-stops-part-way)
explains capacity failures that happen part-way through a deployment.

## GitHub organization settings

Setup downloads build artifacts that GitHub Actions built in your repository.

- In a fork, enable workflows on the **Actions** tab first.
- Push your commits before setup; artifacts exist only for pushed commits.
- If your organization disables Actions, build locally instead; see
  [Exact-commit build artifacts](build-artifacts.md#building-locally-instead).

## Long deployments

Some deployments take 15 minutes or more. Keep the laptop on power with the
lid open; on macOS, `caffeinate -i ./scenarios/<id>/scripts/setup.sh` keeps it
awake for the run.

If the laptop sleeps or loses its network, the deployment keeps running in
Azure. Wait until this command prints nothing, then rerun the same setup
command:

```bash
az deployment group list --resource-group <group> --query "[?properties.provisioningState=='Running'].name" --output tsv
```

## If your laptop can't be fixed

Use the scenario's Codespace; see
[Open in Codespaces](../README.md#open-in-codespaces). Your tenant's sign-in
rules and your subscription's Azure Policy still apply there.
