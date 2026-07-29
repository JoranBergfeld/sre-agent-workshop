# Scenario: CPU Runaway

> Scenario: `cpu-runaway` · Azure Virtual Machines · Compute saturation

Run every command below from the repository root. The default workload name is
`srelabcpurunaway`; custom workload names must be unique so their Azure
resource names do not collide.

## Scenario modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the agent workflow](./docs/90-watch-agent-workflow.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## What breaks

The injector starts a sustained, hidden PowerShell workload on the first
Windows VM. CPU stays above 85 percent, starving the IIS workload until an
approved operator stops only that workload.

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

The SRE Agent investigates the `vm-cpu-runaway` alert and proposes the
evidence-backed change. It does **not** run remediation directly.

1. A human creates or explicitly approves one GitHub issue and assigns it to
   `@copilot`.
2. Copilot authors a pull request containing the reviewed scenario or
   infrastructure fix.
3. A human reviews and merges the pull request, then performs the controlled
   deployment through the approved deployment process.

The direct remediation script is an approved manual fallback only when that
GitOps path cannot be used. An authorized operator must supply a `CHG-` or
`INC-` ticket and type the exact word `APPROVE` at the approval gate:

```bash
./scenarios/cpu-runaway/tools/invoke-approved-remediation.sh \
  --action stop-cpu-runaway \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --change-ticket CHG-12345
```

The gate records successful manual actions in
`scenarios/cpu-runaway/output/actions-audit.log`.

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
