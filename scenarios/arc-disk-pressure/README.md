# Scenario: Arc-Enabled Server Disk Pressure (C: Pressure)

> Scenario: `arc-disk-pressure` · Azure Arc-enabled Servers · Storage capacity

Run every command below from the repository root. This self-contained capsule
uses one disposable Windows Server evaluation host with IIS, Azure Monitor,
and Azure Arc onboarding. It is not production-equivalent Azure Local or
production on-premises infrastructure.

The default workload is `srelabarcdisk`. For a separate deployment, choose a
unique workload name such as `srelabarcdiskjordan`; use that same name in every
command. The host is addressed through its Arc machine name after onboarding.
Do not reuse the previous VM workshop workload name.

## Cost profile

The **high** profile is a qualitative cost estimate. The dominant cost drivers
are the disposable Windows host, Arc/Monitor resources, Application Insights
and Log Analytics ingestion, and Azure SRE Agent usage. Confirm current pricing for
your deployment region before provisioning, and run cleanup immediately after
completing the scenario.

## Module index

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the workflow](./docs/90-watch-agent-workflow.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## Capsule commands

```bash
./scenarios/arc-disk-pressure/scripts/setup.sh
./scenarios/arc-disk-pressure/scripts/onboard-arc.sh
./scenarios/arc-disk-pressure/scripts/inject.sh
./scenarios/arc-disk-pressure/scripts/validate.sh
```

```powershell
./scenarios/arc-disk-pressure/scripts/setup.ps1
./scenarios/arc-disk-pressure/scripts/onboard-arc.ps1
./scenarios/arc-disk-pressure/scripts/inject.ps1
./scenarios/arc-disk-pressure/scripts/validate.ps1
```

The injector writes bounded 512 MB files under `C:\Temp\diskfill` until C:
free space reaches approximately 8%, while preserving a 2 GiB reserve. The
alert in `infra/bicep/modules/alert.bicep` fires below 10% free space.

## Incident and remediation flow

The SRE Agent investigates and proposes recovery only. An authorized learner
supplies a `CHG-` or `INC-` ticket, types exact `APPROVE`, and invokes the
scenario-owned approval gate. The normal recovery runs the surgical cleanup
through Arc Run Command. If Arc is unhealthy, stop and require fresh approval
before performing the same bounded action locally:

```bash
./scenarios/arc-disk-pressure/tools/invoke-approved-remediation.sh \
  --action cleanup-arc-disk-pressure \
  --resource-group rg-srelabarcdisk \
  --machine-name srelabarcdisk-vm01 \
  --change-ticket CHG-12345
```

```powershell
./scenarios/arc-disk-pressure/tools/Invoke-ApprovedRemediation.ps1 `
  -Action cleanup-arc-disk-pressure `
  -ResourceGroup rg-srelabarcdisk `
  -VmName srelabarcdisk-vm01 `
  -ChangeTicket CHG-12345
```

The gate appends approved executions to `output/actions-audit.log`.
