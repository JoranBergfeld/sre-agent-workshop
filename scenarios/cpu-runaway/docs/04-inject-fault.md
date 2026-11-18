# 04 Inject the CPU Fault

Run commands from the repository root. Only inject into this disposable lab,
after deployment, a healthy baseline, agent onboarding, and response setup.
The operator runs the injector; the SRE Agent does not.

## 1. Confirm the target

These examples target resource group `rg-srelabcpurunaway` and VM
`srelabcpurunaway-vm01`. If you used custom names, substitute them before
running anything. Confirm your subscription and VM in either shell:

```text
az account show --query "{name:name,id:id}" --output table
az vm show --resource-group rg-srelabcpurunaway --name srelabcpurunaway-vm01 --query "{name:name,id:id}" --output json
```

## 2. Start the controlled CPU workers

Choose **one** shell:

**Bash**

```bash
./scenarios/cpu-runaway/scripts/inject.sh \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\scripts\inject.ps1 `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01
```

The script uses Azure VM Run Command; you do not need an RDP session or an
open Bastion tunnel to inject. It writes the lab worker script and state under
`C:\SreCpuRunaway` on the target VM and starts one busy-loop worker per logical
processor (at least two), marked `sre-cpu-runaway-v1`. The second VM is not
targeted.

Expected guest-script output includes
`Started 2 sustained CPU workers with marker sre-cpu-runaway-v1` on the default
two-processor VM. The worker count can differ with another VM size. If Run
Command reports an error, resolve it before continuing; do not treat a
partially completed command as a successful injection.

Record the injection time. The workers keep running until you recover or
delete the lab; there is no automatic timeout. Re-running injection replaces
the existing marked workers, so do not repeatedly inject while waiting for
telemetry.

## 3. Wait for evidence and the alert

1. Re-run the baseline `Perf` query from step 01. New samples for `srecpu01`
   should rise above 85%. IIS may become slower, but an HTTP 200 response does
   not mean CPU saturation failed.
2. In Azure Monitor **Alerts**, look for the fired **VM CPU Runaway** alert
   from rule `srelabcpurunaway-vm-cpu-runaway`, with computer `srecpu01`.
3. The rule evaluates a five-minute CPU window every five minutes and fires
   when average CPU exceeds 85%. Allow a full high-CPU window, another
   evaluation, and telemetry ingestion time; the alert is not immediate.

If samples are missing, check the selected workspace, computer name, Azure
Monitor Agent, and data collection rule association. If samples are present
but CPU stays low, inspect the injector's Run Command result and worker
processes before retrying. If CPU is high but no alert fires, check that the
rule is enabled and examine its evaluation results and time window.

**Checkpoint:** you have an injection timestamp, sustained high-CPU samples,
and a fired alert. Keep the fault active for the investigation, then recover
in the next step.

**Previous:** [03 Configure incident response](./03-configure-incident-response.md) |
**Next:** [05 Investigate, approve recovery, and verify](./05-investigate-and-recover.md).
