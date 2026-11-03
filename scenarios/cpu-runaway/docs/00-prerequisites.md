# 00 Prerequisites

Run commands from the repository root. You need an Azure subscription with a
deployment role such as Contributor **and** permission to create the
scenario's managed-identity role assignments:
`Microsoft.Authorization/roleAssignments/write`. Owner or User Access
Administrator provides the required role-assignment permission. You also need
Azure CLI, GitHub CLI, and a supported region:
`eastus2`, `swedencentral`, or `australiaeast`. Azure Bastion tunneling must
be available in your Azure CLI installation.

The default workload is `srelabcpurunaway`. If you set a custom workload name,
it must be unique because it prefixes every scenario resource name.

Validate the local prerequisites before deployment.

```bash
./scenarios/cpu-runaway/scripts/setup.sh --location eastus2
```

```powershell
.\scenarios\cpu-runaway\scripts\setup.ps1 -Location eastus2
```

The deployment needs a Windows VM administrator password. Supply it as a
secure deployment parameter; do not store it in `main.bicepparam`.

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
