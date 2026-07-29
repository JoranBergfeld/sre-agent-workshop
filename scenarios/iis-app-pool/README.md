# Scenario: IIS App Pool Failure

> Scenario: `iis-app-pool` · Azure Virtual Machines · high cost profile

Run every command below from the repository root. This capsule deploys its own
Windows/IIS environment, monitoring, identity, network, and IIS app-pool alert.

## Modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the SRE Agent](./docs/90-watch-agent-workflow.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## What breaks

The injector stops `DefaultAppPool` on `srelabiisapppool-vm01`. IIS returns
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

## Required recovery model

After the SRE Agent identifies the stopped pool, a human creates or explicitly
approves exactly one GitHub issue with the evidence and recovery plan, then
assigns it to `@copilot`. Copilot authors the pull request. A human reviews
and merges that PR, then deploys the merged change.

This is the normal incident → issue → Copilot PR → human merge → deployment
path. Do not directly change the VM during routine remediation.

## Manual approved fallback

Only when the issue-to-Copilot path cannot be used, an authorized operator can
run the capsule-local gate. It accepts only the local
`start-iis-app-pool` remediation, requires a `CHG-` or `INC-` ticket and an
exact `APPROVE`, and appends an audit entry:

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

Reconcile a fallback with the issue and Copilot pull request afterwards.

## Validate recovery

```bash
./scenarios/iis-app-pool/scripts/validate.sh
```

```powershell
./scenarios/iis-app-pool/scripts/validate.ps1
```

Continue to [99 Cleanup](./docs/99-cleanup.md) after recovery.
