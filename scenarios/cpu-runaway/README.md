# Scenario: CPU Runaway

> Scenario: `cpu-runaway` · Azure Virtual Machines · Compute saturation

Run every command below from the repository root. The default workload name is
`srelabcpurunaway`; custom workload names must be unique so their Azure
resource names do not collide.

## Cost profile

This scenario has a **high** cost profile. The dominant cost drivers are two
Windows VMs, Standard Azure Bastion, Application Insights and Log Analytics
ingestion, and Azure SRE Agent usage. Confirm current pricing for your
deployment region before provisioning, and run cleanup immediately after
completing the scenario.

## Scenario modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the agent workflow](./docs/90-watch-agent-workflow.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## What breaks

The injector starts one controlled PowerShell worker per logical processor
(at least two) on the first Windows VM. CPU stays above 85 percent, starving
the IIS workload until an approved operator stops only those marked workers.

## Inject the fault

**Bash**

```bash
./scenarios/cpu-runaway/scripts/inject.sh
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\scripts\inject.ps1
```

## Investigate and recover

The SRE Agent investigates the `vm-cpu-runaway` alert and supplies
evidence. It does **not** run remediation directly.

## Approved remediation

The approval gate is the normal remediation path. An authorized operator
reviews the evidence, supplies a `CHG-` or `INC-` ticket, and types the exact
word `APPROVE`. The gate runs only the scenario-owned action and writes an
audit entry:

```bash
./scenarios/cpu-runaway/tools/invoke-approved-remediation.sh \
  --action stop-cpu-runaway \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --change-ticket CHG-12345
```

The gate records successful manual actions in
`scenarios/cpu-runaway/output/actions-audit.log`.

GitHub issues and Copilot may assist with diagnosis or documentation, but they
do not replace this approval gate and cannot run remediation directly.

## Validate recovery

**Bash**

```bash
./scenarios/cpu-runaway/scripts/validate.sh
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\scripts\validate.ps1
```

Finish with [99 Cleanup](./docs/99-cleanup.md).
