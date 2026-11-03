# Module 00: Prerequisites

Run commands from the repository root.

You need:

- Azure subscription Contributor access
- Azure CLI (`az`) and GitHub CLI (`gh`)
- PowerShell 7 for the PowerShell commands
- a supported region: `eastus2`, `swedencentral`, or `australiaeast`
- an Azure resource group and a strong Windows administrator password

Validate the local prerequisites:

```bash
./scenarios/iis-app-pool/scripts/setup.sh --location eastus2
```

```powershell
./scenarios/iis-app-pool/scripts/setup.ps1 -Location eastus2
```


## Region, size, and cost

Provisioning uses the shared placement engine, which needs **Node.js 20+**.
For a new deployment it preflights subscription SKU restrictions, capabilities
and quota, then tries two Windows VMs as `Standard_B2s`, then `Standard_D2s_v5`, then `Standard_D2as_v5`, then `Standard_D2s_v6`, then `Standard_D2s_v4` in the preferred region before falling
back through `eastus2`, `swedencentral`, `australiaeast`. An existing deployment stays pinned to its
region and size. Sizes later in the list can cost more per hour; the
engine reports the region and size it chose. Create and designate the resource
group first (`az group create --name <group> --location <region> --tags
sre-workshop-scenario=iis-app-pool`). See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).

Next: [01 Deploy infrastructure](./01-deploy-infrastructure.md).
