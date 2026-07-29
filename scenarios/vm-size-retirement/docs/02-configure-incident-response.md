# Module 2: Configure Incident Response

Connect the SRE Agent to Azure Monitor and Azure Resource Graph with
read-only investigation access. Give it this capsule's
[`knowledge/operational-guidelines.md`](../knowledge/operational-guidelines.md)
and Resource Graph query.

## Simulate the advisory

Service Health cannot emit an arbitrary advisory on demand, so the injector
creates the affected VMs and prints a **simulated** advisory payload:

```bash
./scenarios/vm-size-retirement/scripts/inject.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/inject.ps1
```

Paste that output into the agent, or use the fixed example in
[`service-health-advisory.json`](../service-health-advisory.json). This is not a
production alert test.

## Production reference

For a real subscription, build and review the standalone Service Health alert:

```bash
az bicep build \
  --file ./scenarios/vm-size-retirement/infra/bicep/service-health-alert.bicep
```

It routes actual `ServiceHealth`/`ActionRequired` Virtual Machines events
through an Action Group. It remains intentionally outside `main.bicep` so the
capsule simulation does not deploy or depend on it.

## Investigate

The local tool executes the scenario's fixed Resource Graph query; it accepts
only a resource group and has no scenario selector:

```bash
./scenarios/vm-size-retirement/scripts/tools/invoke-vm-investigation.sh \
  --resource-group rg-srelabretirement
```

```powershell
./scenarios/vm-size-retirement/scripts/tools/Invoke-VmInvestigation.ps1 `
  -ResourceGroup rg-srelabretirement
```

Continue to [90 Watch the SRE Agent](./90-watch-sre-agent.md).
