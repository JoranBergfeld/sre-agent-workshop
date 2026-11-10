# 00 Prerequisites

Run commands from the repository root. You need an Azure subscription with a
deployment role such as Contributor **and** permission to create the
scenario's managed-identity role assignments:
`Microsoft.Authorization/roleAssignments/write`. Owner or User Access
Administrator provides the required role-assignment permission. You also need
Azure CLI with Bicep, and a supported region:
`eastus2`, `swedencentral`, or `australiaeast`. Azure Bastion tunneling must
be available in your Azure CLI installation.

Use Bash (for example, in the scenario's development container) or PowerShell
7. The PowerShell smoke test uses Windows networking commands and `curl.exe`,
so run that variant on Windows. GitHub CLI is optional; this scenario does not
require an issue or a Copilot pull request to recover.

Sign in and select the subscription you intend to use. These commands work
in either shell:

```text
az login
az account set --subscription "<subscription-id>"
az account show --query "{name:name,id:id}" --output table
az bicep version
```

The operator who injects and recovers the fault also needs permission to run
VM Run Command on the lab VM (for example, Contributor on the resource group).
This is separate from the SRE Agent's read-only investigation access.

The default workload is `srelabcpurunaway`. If you set a custom workload name,
it must be unique because it prefixes every scenario resource name.

Validate the local prerequisites before deployment.

```bash
./scenarios/cpu-runaway/scripts/setup.sh --location eastus2
```

```powershell
.\scenarios\cpu-runaway\scripts\setup.ps1 -Location eastus2
```

Expected result: `All checks passed.` The setup script checks prerequisites
and runs a read-only placement preflight; it does **not** deploy resources or
inject a fault.

The deployment needs a Windows VM administrator password. Enter it at the
deployment prompt in the next step; do not store it in `main.bicepparam` or
put it in shell history.

## Region, size, and cost

Provisioning uses the shared placement engine, which needs **Node.js 20+**.
For a new deployment it preflights subscription SKU restrictions, capabilities
and quota, then tries two Windows VMs as `Standard_B2s`, then `Standard_D2s_v5`, then `Standard_D2as_v5`, then `Standard_D2s_v6`, then `Standard_D2s_v4` in the preferred region before falling
back through `eastus2`, `swedencentral`, `australiaeast`. An existing deployment stays pinned to its
region and size. Sizes later in the list can cost more per hour; the
engine reports the region and size it chose. Create and designate the resource
group first (`az group create --name <group> --location <region> --tags
sre-workshop-scenario=cpu-runaway`). See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).

**Next:** [01 Deploy infrastructure and check the baseline](./01-deploy-infrastructure.md).
