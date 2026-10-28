# 01 Deploy Infrastructure and Check the Baseline

Run commands from the repository root. This scenario deploys two Windows
Server VMs with IIS, Azure Monitor agents, a Bastion host, Log Analytics,
Application Insights, and the CPU Runaway alert.

The default workload name is `srelabcpurunaway`. A custom workload name must
be unique.

## 1. Deploy the healthy environment

Create the scenario resource group once (same command in either shell):

```bash
az group create --name rg-srelabcpurunaway --location eastus2
```

Deploy the scenario through your controlled deployment process. For a manual
lab deployment, use the capsule template and provide the administrator
password securely:

**Bash**

```bash
az deployment group create \
  --name cpu-runaway-lab \
  --resource-group rg-srelabcpurunaway \
  --template-file ./scenarios/cpu-runaway/infra/bicep/main.bicep \
  --parameters workloadName=srelabcpurunaway location=eastus2
```

**PowerShell 7**

```powershell
az deployment group create `
  --name cpu-runaway-lab `
  --resource-group rg-srelabcpurunaway `
  --template-file .\scenarios\cpu-runaway\infra\bicep\main.bicep `
  --parameters workloadName=srelabcpurunaway location=eastus2
```

Azure CLI prompts for the missing secure `adminPassword` parameter. Enter a
Windows administrator password that meets Azure's complexity requirements.
If you selected a different supported region, change both the resource-group
location and the template's `location` parameter.

Wait for the deployment to finish successfully before continuing. This can
take several minutes. No CPU workers are started by deployment.

## 2. Record the deployment outputs

In either shell:

```text
az deployment group show --resource-group rg-srelabcpurunaway --name cpu-runaway-lab --query properties.outputs --output json
```

Record the deployment outputs: VM resource names, Windows computer names,
Bastion host name, and Log Analytics workspace ID. With the defaults, the
first VM ARM resource is `srelabcpurunaway-vm01` and its Windows computer name
is the deterministic short name `srecpu01`. The computer names are used by
the `Perf` query; Azure CLI and Bastion commands use the longer ARM resource
name.

The deployment associates both Azure Monitor Agent VMs with the CPU data
collection rule. It sends `\Processor(_Total)\% Processor Time` to the
scenario Log Analytics workspace for the `vm-cpu-runaway` alert.

## 3. Check the healthy IIS baseline

**Bash**

```bash
./scenarios/cpu-runaway/scripts/validate.sh \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --bastion-name srelabcpurunaway-bas
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\scripts\validate.ps1 `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -BastionName srelabcpurunaway-bas
```

Expected result: `HTTP status: 200` and `Smoke test passed.` The script opens
a temporary Bastion tunnel on local port 18080, checks IIS, then closes the
tunnel. Do not leave another tunnel using that port. Do not expose public RDP
or HTTP endpoints to work around a failed check.

In the deployed Log Analytics workspace's **Logs**, run:

```kusto
Perf
| where TimeGenerated > ago(15m)
| where Computer =~ "srecpu01"
| where ObjectName == "Processor"
    and CounterName == "% Processor Time"
    and InstanceName == "_Total"
| summarize AvgCpu=avg(CounterValue) by bin(TimeGenerated, 1m)
| order by TimeGenerated asc
```

Wait for CPU samples to appear and for startup activity to settle below 85%.
An empty result is not a healthy baseline: check the VM's Azure Monitor Agent
extension and data collection rule association, then retry after ingestion.
Keep this query for comparing before, during, and after the incident.

**Previous:** [00 Prerequisites](./00-prerequisites.md) |
**Next:** [02 Onboard the SRE Agent](./02-onboard-sre-agent.md).
