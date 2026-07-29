# 01 Deploy Infrastructure

Run commands from the repository root. This scenario deploys two Windows
Server VMs with IIS, Azure Monitor agents, a Bastion host, Log Analytics,
Application Insights, and the CPU Runaway alert.

The default workload name is `srelabcpurunaway`. A custom workload name must
be unique.

Create the scenario resource group once:

```bash
az group create --name rg-srelabcpurunaway --location eastus2
```

Deploy the scenario through your controlled deployment process. For a manual
lab deployment, use the capsule template and provide the administrator
password securely:

```bash
az deployment group create \
  --resource-group rg-srelabcpurunaway \
  --template-file ./scenarios/cpu-runaway/infra/bicep/main.bicep \
  --parameters workloadName=srelabcpurunaway adminPassword='<secure-password>'
```

Record the deployment outputs: VM names, Bastion host name, and Log Analytics
workspace ID. The first VM is `srelabcpurunaway-vm01` with the defaults.

Use an Azure Bastion tunnel rather than exposing public RDP or HTTP endpoints:

```bash
./scenarios/cpu-runaway/scripts/access/start-http-tunnel.sh \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --bastion-name srelabcpurunaway-bas
```

```powershell
.\scenarios\cpu-runaway\scripts\access\start-rdp-tunnel.ps1 `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -BastionName srelabcpurunaway-bas
```
