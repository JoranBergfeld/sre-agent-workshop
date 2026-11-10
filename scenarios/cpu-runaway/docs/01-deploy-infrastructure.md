# 01 Deploy Infrastructure and Check the Baseline

Run commands from the repository root. This scenario deploys two Windows
Server VMs with IIS, Azure Monitor agents, a Bastion host, Log Analytics,
Application Insights, and the CPU Runaway alert.

The default workload name is `srelabcpurunaway`. A custom workload name must
be unique.

## 1. Deploy the healthy environment

Create and designate an unused resource group once (the tooling never creates
or deletes groups; its region is only metadata). The same commands work in
either shell:

```text
az group exists --name rg-srelabcpurunaway   # must print false
az group create --name rg-srelabcpurunaway --location eastus2 --tags sre-workshop-scenario=cpu-runaway
```

Deploy through your controlled process: the **Deploy CPU Runaway
Infrastructure** workflow, or manually with the placement engine. The
administrator password is read from an environment variable and never printed:

**Bash**

```bash
read -rsp "Windows VM administrator password: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
node scripts/placement/provision.mjs deploy cpu-runaway \
  --location eastus2 --workload srelabcpurunaway \
  --secure-param-env adminPassword=ADMIN_PASSWORD \
  --outputs-file cpu-runaway-outputs.json
unset ADMIN_PASSWORD
```

**PowerShell 7**

```powershell
$secure = Read-Host 'Windows VM administrator password' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
node scripts/placement/provision.mjs deploy cpu-runaway `
  --location eastus2 --workload srelabcpurunaway `
  --secure-param-env adminPassword=ADMIN_PASSWORD `
  --outputs-file cpu-runaway-outputs.json
Remove-Item Env:ADMIN_PASSWORD
```

Enter a Windows administrator password that meets Azure's complexity
requirements. The engine checks SKU restrictions, capabilities and vCPU quota
for the whole fleet, then tries the VM sizes in `infra/placement.json` (B2s,
then compatible two-vCPU D-series) in a region before falling back to Sweden
Central and Australia East. It records the region and size it used on the
resource group; reruns stay pinned to them and never resize, relocate or
delete anything. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
Requires Node.js 20+.

Wait for the deployment to finish successfully before continuing. This can
take several minutes. No CPU workers are started by deployment.

## 2. Record the deployment outputs

The engine writes the deployment outputs to `cpu-runaway-outputs.json` (the
deploy workflow prints the same values in its summary). In either shell:

```text
cat cpu-runaway-outputs.json
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
