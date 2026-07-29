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
./scenarios/disk-full/scripts/setup.sh --location eastus2
```

```powershell
./scenarios/disk-full/scripts/setup.ps1 -Location eastus2
```

Use `srelabdiskfull` as the default workload. If that is not unique for your
subscription, select a unique value such as `srelabdiskfulljordan` and use it
consistently in the deployment, injection, investigation, validation, and
cleanup commands.
