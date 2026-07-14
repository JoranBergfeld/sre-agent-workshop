# VM Module 2: Configure Incident Response

Use the same incident platform pattern as the AKS track:

1. Connect the SRE Agent to **Azure Monitor**.
2. Create an incident response plan scoped to VM workshop alerts.
3. Use **Review-style approvals** for remediation in this VM track.

> **No GitHub issue logging on this track.** Unlike the AKS and App Service tracks, the VM track's
> remediation is **approval-gated** and runs through `Invoke-ApprovedRemediation` — the SRE Agent
> never files GitHub issues or opens PRs here. If you onboard the agent using
> [Connect GitHub to the SRE Agent](../../../docs/connect-github-to-sre-agent.md), connecting the
> **code repository** is enough; **skip the GitHub connector / issue-logging step**.

## Approval-gated execution

Remediation always runs through `Invoke-ApprovedRemediation.ps1`, which requires a CHG/INC ticket and explicit `APPROVE` confirmation, then writes an audit entry. Available actions:

| Action | Scope | Use when |
|--------|-------|----------|
| `cleanup-disk` | Removes only `C:\Temp\diskfill` artifacts | Surgical fix for Scenario 1 |
| `cleanup-temp` | Clears everything under `C:\Temp` | Agent policy forbids arbitrary deletes but allows approved Temp cleanup |
| `start-iis-app-pool` | Restarts the target IIS app pool | Scenario 2 remediation |
| `stop-cpu-runaway` | Stops the sustained CPU workload | Scenario 3 remediation |
| `migrate-vm-size` | Resizes every VM on a retiring size to the current target (`Standard_D2s_v5`) | Scenario 4 (VM size retirement) migration |

Example:

```powershell
.\workshops\vm\tools\Invoke-ApprovedRemediation.ps1 -Action cleanup-disk -ResourceGroup rg-srelabvm -VmName srelabvm-vm01 -ChangeTicket CHG-12345
```

No remediation action runs without an approval prompt and valid ticket format.

## Next Step

Choose a scenario from the [Scenarios catalog](../README.md#scenarios) and follow its README to inject the fault, then remediate with the approval-gated action above. New to the VM track? Start with [`disk-full`](../scenarios/disk-full/README.md), which fills the `C:` drive until the disk-pressure alert fires.

