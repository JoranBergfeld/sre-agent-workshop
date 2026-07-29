# Scenario: VM Size Retirement (SKU Discontinuation)

> Scenario: `vm-size-retirement` · Azure Virtual Machines

Run every command below from the repository root. This capsule owns its
infrastructure, scenario lifecycle, investigation, approval gate, and output.

## Workshop modules

1. [00 Prerequisites](./docs/00-prerequisites.md)
2. [01 Deploy infrastructure](./docs/01-deploy-infrastructure.md)
3. [02 Configure incident response](./docs/02-configure-incident-response.md)
4. [90 Watch the SRE Agent](./docs/90-watch-sre-agent.md)
5. [99 Cleanup](./docs/99-cleanup.md)

## Scenario

Azure is retiring the Dv2/DSv2 VM families. The injector creates three
deallocated VMs on the retiring SKUs and emits a realistic advisory. The SRE
Agent inventories all affected VMs with Azure Resource Graph, preserving the
retirement deadline and ownership tags as incident evidence.

The injector **simulates** the advisory kickoff. Azure Service Health events
cannot be injected on demand. In a production environment, use the documented,
standalone [Service Health Activity Log alert](./infra/bicep/service-health-alert.bicep)
to route real Service Health events to an incident intake. It is a production
reference only: `main.bicep` does not import or deploy it as a scenario alert.

## Capsule commands

```bash
./scenarios/vm-size-retirement/scripts/setup.sh
./scenarios/vm-size-retirement/scripts/inject.sh
./scenarios/vm-size-retirement/scripts/tools/invoke-vm-investigation.sh
./scenarios/vm-size-retirement/scripts/validate.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/setup.ps1
./scenarios/vm-size-retirement/scripts/inject.ps1
./scenarios/vm-size-retirement/scripts/tools/Invoke-VmInvestigation.ps1
./scenarios/vm-size-retirement/scripts/validate.ps1
```

The validator intentionally fails until every retiring VM is migrated.

## Recovery contract

Normal recovery is **one issue assigned to `@copilot` → Copilot PR → human
merge/controlled deploy**. The issue must include the advisory, affected VM
inventory, target SKU, deadline, and validation evidence. A human reviews the
PR and chooses when to run the controlled deployment.

Do not resize VMs directly during normal incident response. If the GitOps path
is unavailable and an urgent resize is authorized, use the audited manual
fallback:

```bash
./scenarios/vm-size-retirement/scripts/tools/invoke-approved-remediation.sh \
  --action migrate-vm-size --change-ticket CHG-12345
```

```powershell
./scenarios/vm-size-retirement/scripts/tools/Invoke-ApprovedRemediation.ps1 `
  -Action migrate-vm-size -ChangeTicket CHG-12345
```

The fallback requires a valid `CHG-` or `INC-` ticket and an interactive
`APPROVE` response. It records execution in `output/actions-audit.log`.
