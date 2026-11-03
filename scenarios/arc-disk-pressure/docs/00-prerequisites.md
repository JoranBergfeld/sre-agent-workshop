# Module 00: Prerequisites

Run commands from the repository root. This scenario requires an Azure
subscription where you can create a resource group and its VM, networking,
monitoring, and managed-identity resources. Install Azure CLI and ensure it is
logged in. Azure Bastion tunneling requires the Azure CLI `bastion` extension
when prompted.

The supported regions are `eastus2`, `swedencentral`, and `australiaeast`.
The scenario is a **high** cost profile because it creates two Windows VMs and
a Standard Azure Bastion host. Remove the resource group after the exercise.

Validate tools and the selected VM size:

```bash
./scenarios/arc-disk-pressure/scripts/setup.sh --location eastus2
```

```powershell
./scenarios/arc-disk-pressure/scripts/setup.ps1 -Location eastus2
```

Use `srelabarcdisk` as the default workload. If that is not unique for your
subscription, select a unique value such as `srelabarcdiskjordan` and use it
consistently in the deployment, injection, investigation, validation, and
cleanup commands.

## Region, size, and cost

Provisioning uses the shared placement engine, which needs **Node.js 20+**.
For a new deployment it preflights subscription SKU restrictions, capabilities
and quota, then tries the Windows evaluation host as `Standard_D2s_v7`, then `Standard_D2s_v6`, then `Standard_D2as_v6`, then `Standard_D2s_v5`, then `Standard_D2as_v5` in the preferred region before falling
back through `eastus2`, `swedencentral`, `australiaeast`. An existing deployment stays pinned to its
region and size. Sizes later in the list can cost more per hour; the
engine reports the region and size it chose. Create and designate the resource
group first (`az group create --name <group> --location <region> --tags
sre-workshop-scenario=arc-disk-pressure`). See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
