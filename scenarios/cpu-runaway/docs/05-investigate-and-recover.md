# 05 Investigate, Approve Recovery, and Verify

Run commands from the repository root. The fault from step 04 should still
be active. This step separates what the SRE Agent does from what **you, the
authorized operator**, must do.

## 1. Let the SRE Agent investigate

Open the investigation started by your alert-triggered response plan. If you
are following the manual route, start an agent conversation with:

> Investigate the fired VM CPU Runaway alert for srelabcpurunaway-vm01 in
> rg-srelabcpurunaway. The Windows computer name is srecpu01. Correlate the
> alert with recent Perf CPU samples and my injection time: <injection-time>.
> Show evidence and timestamps, explain workload impact, and propose the
> stop-cpu-runaway action for human review. Do not run remediation or change
> the VM.

Review the agent's evidence against your own CPU query and alert. Distinguish
observed facts from the expected lab explanation: high CPU alone does not
prove which process caused it. A read-only agent may need an operator to
inspect guest processes; it must not claim to have inspected them if it has
not.

Before approving recovery, confirm the subscription, resource group, VM,
incident timing, and that stopping the lab's marked workers is the intended
action. Do not authorize a blanket stop of PowerShell processes, an IIS
restart, or a VM reboot.

### Optional: capture a local investigation artifact

This helper is **not the SRE Agent**. It queries telemetry when given a
workspace ID and writes a scripted trace and draft postmortem. Its stage
labels, including `Execute` and `Validate`, describe the intended workflow:
they do not execute recovery, prove the cause, or verify service health.

Replace `<log-analytics-workspace-id>` with the GUID from the deployment
outputs, not the workspace's Azure resource ID.

**Bash**

```bash
./scenarios/cpu-runaway/tools/invoke-vm-investigation.sh \
  --workspace-id <log-analytics-workspace-id> \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --computer-name srecpu01
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\tools\Invoke-VmInvestigation.ps1 `
  -WorkspaceId "<log-analytics-workspace-id>" `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -ComputerName srecpu01
```

Artifacts are written under [output](../output/). Review them against actual
evidence; do not treat generated confidence or stage labels as proof of
successful investigation or recovery.

## 2. Understand exactly what the approval gate means

The **approval gate is a script in this repository**, not a separate service.
You run it locally in an interactive terminal after reviewing the diagnosis.

| Item | Meaning in this lab |
|---|---|
| Authorized operator | A human allowed to change this lab VM, signed in to Azure CLI with VM Run Command permission. The script uses that human's CLI session, not the agent's read-only identity. |
| `CHG-12345` or `INC-12345` | A change or incident reference, with uppercase prefix and digits. The script checks the format and records the value; it does not create a ticket, connect to a ticketing system, verify that the ticket exists, or check its approval state. Use your actual reference where required. For an isolated workshop with no ticketing system, `CHG-12345` is an example lab reference only. |
| `APPROVE` | The confirmation you type into the script's terminal prompt after checking the displayed action and target. It is not a chat message to the SRE Agent. Enter it exactly as shown. |
| `stop-cpu-runaway` | The scenario-owned recovery action. It uses VM Run Command to stop workers matching the lab script path and marker, then removes the lab worker script and state file. It does not stop all PowerShell processes, restart IIS, or reboot the VM. |
| Audit entry | After the action returns successfully, the wrapper appends a JSON line to [actions-audit.log](../output/actions-audit.log), containing timestamp, ticket, action, resource group, VM name, and `status: executed`. This local record is not a centrally enforced approval system or proof of recovery. |

This is a deliberate pause between **the agent proposing a change** and
**a human executing it**. It does not replace your organization's access
controls or change-management process. Do not bypass it by running the
remediation script directly or granting the agent write access.

## 3. Run the approved recovery yourself

Choose one shell. Replace the example ticket reference and any custom
resource names before running:

**Bash**

```bash
./scenarios/cpu-runaway/tools/invoke-approved-remediation.sh \
  --action stop-cpu-runaway \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --change-ticket CHG-12345
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\tools\Invoke-ApprovedRemediation.ps1 `
  -Action stop-cpu-runaway `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -ChangeTicket CHG-12345
```

The script displays the ticket, action, resource group, and VM, then prompts:

```text
Type APPROVE to execute:
```

Check those values, then type `APPROVE` and press Enter. Any response other
than approval cancels rather than running recovery. Do not pipe an automatic
confirmation into the script; the human review is the point of this step.

Expected output includes `Stopped only CPU Runaway worker processes` and
`Approved remediation completed and audited.` Inspect the latest audit entry:

**Bash**

```bash
tail -n 1 ./scenarios/cpu-runaway/output/actions-audit.log
```

**PowerShell 7**

```powershell
Get-Content .\scenarios\cpu-runaway\output\actions-audit.log -Tail 1
```

If execution fails, investigate the reported error. A trace, a ticket
reference, or a confirmation alone is not evidence that recovery succeeded.

## 4. Verify CPU and application recovery

Run the same health check used for the baseline.

**Bash**

```bash
./scenarios/cpu-runaway/scripts/validate.sh \
  --resource-group rg-srelabcpurunaway \
  --vm-name srelabcpurunaway-vm01 \
  --bastion-name srelabcpurunaway-bas
```

**PowerShell 7**

```powershell
.\scenarios\cpu-runaway\scripts\validate.ps1 `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -BastionName srelabcpurunaway-bas
```

Expected result: `HTTP status: 200` and `Smoke test passed.` This checks IIS
through Bastion; it does **not** check CPU or alert resolution.

Also:

1. Re-run the `Perf` query from step 01. Confirm that samples **after the
   recovery time** fall below 85% and return toward the baseline.
2. Wait for the alert's evaluation window to clear and confirm the fired
   alert resolves. Ingestion and alert evaluation mean this is not immediate.
3. Record the recovery time, CPU before and after, HTTP result, ticket
   reference, and any uncertainty in your incident notes or draft postmortem.

If IIS responds but CPU is still high, recovery is not verified. Inspect
remaining processes and telemetry rather than stopping unrelated processes
or declaring success from HTTP status alone.

**Checkpoint:** CPU has recovered, IIS responds, the alert resolves, and the
approved action has a local audit record. You can now close the exercise.

GitHub issues and Copilot may help document findings, but neither replaces
human approval or executes recovery in this scenario.

**Previous:** [04 Inject the CPU fault](./04-inject-fault.md) |
**Next:** [99 Cleanup](./99-cleanup.md).
