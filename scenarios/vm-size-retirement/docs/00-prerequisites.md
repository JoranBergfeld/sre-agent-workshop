# Module 0: Prerequisites

This scenario provisions Windows VMs, Azure Bastion, Log Analytics, Application
Insights, and a managed identity. Its cost profile is **high**; delete the
resource group as soon as the workshop is complete.

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
