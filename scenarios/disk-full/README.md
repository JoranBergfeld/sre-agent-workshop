# Scenario: Disk Full (C: Pressure)

> Scenario: `disk-full` · Azure Virtual Machines · Storage capacity

Run every command below from the repository root. This self-contained capsule
deploys two Windows Server VMs with IIS, Azure Monitor, Azure Bastion, and the
single scheduled-query alert that detects C: free-space pressure.

The default workload is `srelabdiskfull`. For a separate deployment, choose a
unique workload name such as `srelabdiskfulljordan`; use that same name in every
command and derive VM and Bastion names from it (`<workload>-vm01` and
`<workload>-bas`). The ARM VM names are deliberately separate from the
Windows computer names: VM 01 reports Perf data as `sredisk01` and VM 02 as
`sredisk02`, both within Windows' 15-character computer-name limit. Do not
reuse the previous VM workshop workload name.

## Module index

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the workflow](./docs/90-watch-agent-workflow.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## Capsule commands

```bash
./scenarios/disk-full/scripts/setup.sh
./scenarios/disk-full/scripts/inject.sh
./scenarios/disk-full/scripts/validate.sh
```

```powershell
./scenarios/disk-full/scripts/setup.ps1
./scenarios/disk-full/scripts/inject.ps1
./scenarios/disk-full/scripts/validate.ps1
```

The injector writes 1 GB files under `C:\Temp\diskfill` until the C: drive
cannot accept another file. The direct alert in
`infra/bicep/modules/alert.bicep` fires when `% Free Space` is below 10%.

## Incident and remediation flow

The normal recovery path is exactly:

**incident evidence → one GitHub issue assigned to `@copilot` → Copilot PR →
human review and merge → controlled Bicep deployment by an authorized human**.

The Bicep deployment corrects the desired state. Direct remediation is an
approved manual fallback only when that path cannot restore service in time.
It must use the scenario-owned approval gate, a `CHG-` or `INC-` ticket, and
the exact `APPROVE` confirmation:

```bash
./scenarios/disk-full/tools/invoke-approved-remediation.sh \
  --action cleanup-disk \
  --resource-group rg-srelabdiskfull \
  --vm-name srelabdiskfull-vm01 \
  --change-ticket CHG-12345
```

```powershell
./scenarios/disk-full/tools/Invoke-ApprovedRemediation.ps1 `
  -Action cleanup-disk `
  -ResourceGroup rg-srelabdiskfull `
  -VmName srelabdiskfull-vm01 `
  -ChangeTicket CHG-12345
```

The gate appends approved executions to `output/actions-audit.log`.
