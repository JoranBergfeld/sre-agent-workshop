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

Next: [01 Deploy infrastructure](./01-deploy-infrastructure.md).
