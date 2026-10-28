# Module 90: Watch the Workflow

Inject the fault after the VMs and Azure Monitor agent are reporting data:

```bash
./scenarios/arc-disk-pressure/scripts/inject.sh \
  --resource-group rg-srelabarcdisk \
  --machine-name srelabarcdisk-vm01
```

```powershell
./scenarios/arc-disk-pressure/scripts/inject.ps1 `
  -ResourceGroup rg-srelabarcdisk `
  -VmName srelabarcdisk-vm01
```

Wait for the five-minute alert evaluation. Then run the local investigation
tool with the Log Analytics workspace ID collected at deployment:

```bash
./scenarios/arc-disk-pressure/tools/invoke-arc-investigation.sh \
  --workspace-id <LOG_ANALYTICS_WORKSPACE_ID> \
  --resource-group rg-srelabarcdisk \
  --machine-name srelabarcdisk-vm01 \
  --computer-name srearc01
```

It writes an investigation trace and postmortem to `output/`. Confirm the
trace progresses through Observe, Investigate, Correlate, Hypothesis, Propose,
AwaitApproval, Execute, Validate, and Postmortem.
Use the ARM VM name for run-command and Bastion operations, but use
`srearc01` when querying Perf data for the evaluation Arc-enabled server.

The SRE Agent proposes recovery only. The learner supplies a change or incident
ticket, types exact `APPROVE`, and invokes the scenario-owned approval gate. The
normal recovery executes surgical cleanup through Arc Run Command. If Arc is
unhealthy, stop and escalate for a fresh approval and local execution. After
recovery, validate the IIS workload through Bastion:

```bash
./scenarios/arc-disk-pressure/scripts/validate.sh \
  --resource-group rg-srelabarcdisk \
  --machine-name srelabarcdisk-vm01 \
  --bastion-name srelabarcdisk-bas
```
