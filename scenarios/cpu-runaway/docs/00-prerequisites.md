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

Expected result: `All checks passed.` The setup script checks prerequisites;
it does **not** deploy resources or inject a fault.

The deployment needs a Windows VM administrator password. Enter it at the
deployment prompt in the next step; do not store it in `main.bicepparam` or
put it in shell history.

**Next:** [01 Deploy infrastructure and check the baseline](./01-deploy-infrastructure.md).
