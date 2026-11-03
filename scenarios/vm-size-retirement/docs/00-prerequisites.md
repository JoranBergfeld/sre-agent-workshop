# Module 0: Prerequisites

This scenario provisions Windows VMs, Azure Bastion, Log Analytics, and
Application Insights. Its cost profile is **high**; delete the resource group
as soon as the workshop is complete.

From the repository root, install and authenticate Azure CLI, then run:

```bash
./scenarios/vm-size-retirement/scripts/setup.sh --location eastus2
```

```powershell
./scenarios/vm-size-retirement/scripts/setup.ps1 -Location eastus2
```

You need Contributor access to an Azure subscription and a supported region:
`eastus2`, `swedencentral`, or `australiaeast`. To create the optional
production Service Health Action Group and subscription alert, you also need a
webhook endpoint for the SRE Agent incident intake.

The default workload is `srelabretirement`; it uses resource group
`rg-srelabretirement`.

## SRE Agent identity parameter

The initial deployment can leave `sreAgentPrincipalId` blank because the SRE
Agent may not exist yet. After creating the SRE Agent, copy the **object
(principal) ID** of its managed identity—not its client ID—and set
`SRE_AGENT_PRINCIPAL_ID`. The setup scripts validate its GUID format and the
subsequent Bicep deployment assigns that exact principal **Reader** and
**Monitoring Reader** on the scenario resource group.

```bash
export SRE_AGENT_PRINCIPAL_ID='<SRE-Agent-managed-identity-object-id>'
./scenarios/vm-size-retirement/scripts/setup.sh \
  --sre-agent-principal-id "$SRE_AGENT_PRINCIPAL_ID"
```

```powershell
$env:SRE_AGENT_PRINCIPAL_ID = '<SRE-Agent-managed-identity-object-id>'
./scenarios/vm-size-retirement/scripts/setup.ps1 `
  -SreAgentPrincipalId $env:SRE_AGENT_PRINCIPAL_ID
```

## Region, size, and cost

Provisioning uses the shared placement engine, which needs **Node.js 20+**.
For a new deployment it preflights subscription SKU restrictions, capabilities
and quota, then tries the two baseline Windows VMs as `Standard_B2s`, then `Standard_D2s_v5`, then `Standard_D2as_v5`, then `Standard_D2s_v6`, then `Standard_D2s_v4` in the preferred region before falling
back through `eastus2`, `swedencentral`, `australiaeast`. The preflight also reserves quota for the three real legacy DSv2 VMs that injection creates and requires one modern remediation target (`Standard_D2s_v5`, `Standard_D2as_v5`, `Standard_D2s_v4`) in the same region. An existing deployment stays pinned to its
region and size. Sizes later in the list can cost more per hour; the
engine reports the region and size it chose. Create and designate the resource
group first (`az group create --name <group> --location <region> --tags
sre-workshop-scenario=vm-size-retirement`). See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
