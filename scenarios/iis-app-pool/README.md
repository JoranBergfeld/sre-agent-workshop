# Scenario: IIS App Pool Failure

> Scenario: `iis-app-pool` · Azure Virtual Machines · high cost profile

Run every command below from the repository root. This capsule deploys its own
Windows/IIS environment, monitoring, identity, network, and IIS app-pool alert.

## Modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [04 Onboard the SRE Agent and GitHub context](./docs/04-onboard-sre-agent.md)
5. [90 Watch the SRE Agent](./docs/90-watch-agent-workflow.md)
6. [99 Cleanup](./docs/99-cleanup.md)

## What breaks

The injector stops `DefaultAppPool` on `srelabiisa-01`. IIS returns
HTTP 503 and the capsule's `vm-iis-app-pool-failure` scheduled-query alert
detects the stopped pool from Windows event telemetry.

## Inject and investigate

```bash
./scenarios/iis-app-pool/scripts/inject.sh
./scenarios/iis-app-pool/tools/invoke-vm-investigation.sh \
  --workspace-id <LOG_ANALYTICS_WORKSPACE_ID>
```

```powershell
./scenarios/iis-app-pool/scripts/inject.ps1
./scenarios/iis-app-pool/tools/Invoke-VmInvestigation.ps1 `
  -WorkspaceId <LOG_ANALYTICS_WORKSPACE_ID>
```

The investigation is local to this scenario and has no scenario selector. Its
query is [`investigation/query.kql`](./investigation/query.kql); traces,
postmortems, and approval audits are written to `output/`.

## Approved recovery model

After the SRE Agent identifies the stopped pool, an authorized operator uses
the capsule-local approval gate. It accepts only the local
`start-iis-app-pool` remediation, requires a `CHG-<number>` or
`INC-<number>` ticket, and prompts for exact `APPROVE` confirmation:

```bash
./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh \
  --action start-iis-app-pool \
  --change-ticket CHG-12345
```

```powershell
./scenarios/iis-app-pool/tools/Invoke-ApprovedRemediation.ps1 `
  -Action start-iis-app-pool `
  -ChangeTicket CHG-12345
```

At the prompt, type `APPROVE` exactly. The gate records the ticket, action,
resource group, VM, timestamp, and execution status in
`output/actions-audit.log`. An issue, code change, or external automation must
not replace the CHG/INC approval, exact confirmation, and audit record.

## Validate recovery

```bash
./scenarios/iis-app-pool/scripts/validate.sh
```

```powershell
./scenarios/iis-app-pool/scripts/validate.ps1
```

Continue to [99 Cleanup](./docs/99-cleanup.md) after recovery.
