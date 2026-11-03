# 01 Deploy Infrastructure

Run commands from the repository root. This scenario deploys two Windows
Server VMs with IIS, Azure Monitor agents, a Bastion host, Log Analytics,
Application Insights, and the CPU Runaway alert.

The default workload name is `srelabcpurunaway`. A custom workload name must
be unique.

Create and designate an unused resource group once (the tooling never creates
or deletes groups; its region is only metadata):

```bash
az group exists --name rg-srelabcpurunaway   # must print false
az group create --name rg-srelabcpurunaway --location eastus2 --tags sre-workshop-scenario=cpu-runaway
```

Deploy through your controlled process: the **Deploy CPU Runaway
Infrastructure** workflow, or manually with the placement engine. The
administrator password is read from an environment variable and never printed:

```bash
read -rsp "Windows VM administrator password: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
node scripts/placement/provision.mjs deploy cpu-runaway \
  --location eastus2 --workload srelabcpurunaway \
  --secure-param-env adminPassword=ADMIN_PASSWORD \
  --outputs-file cpu-runaway-outputs.json
```

The engine checks SKU restrictions, capabilities and vCPU quota for the whole
fleet, then tries the VM sizes in `infra/placement.json` (B2s, then compatible two-vCPU D-series) in a region
before falling back to Sweden Central and Australia East. It records the
region and size it used on the resource group; reruns stay pinned to them and
never resize, relocate or delete anything. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
Requires Node.js 20+.

Record the deployment outputs: VM resource names, Windows computer names,
Bastion host name, and Log Analytics workspace ID. With the defaults, the
first VM ARM resource is `srelabcpurunaway-vm01` and its Windows computer name
is the deterministic short name `srecpu01`. The computer names are used by
the `Perf` query; Azure CLI and Bastion commands use the longer ARM resource
name.

The deployment associates both Azure Monitor Agent VMs with the CPU data
collection rule. It sends `\Processor(_Total)\% Processor Time` to the
scenario Log Analytics workspace for the `vm-cpu-runaway` alert.

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
