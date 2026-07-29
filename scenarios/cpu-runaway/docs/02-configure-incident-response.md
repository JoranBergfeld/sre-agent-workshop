# 02 Configure Incident Response

Configure the SRE Agent to observe the `vm-cpu-runaway` Azure Monitor alert
and investigate the `Perf` CPU signal. The SRE Agent may diagnose and propose
a change, but it must not run direct remediation.

## Required approval and recovery flow

1. The SRE Agent collects alert and VM evidence, then presents its diagnosis.
2. A human creates or explicitly approves exactly one GitHub issue and assigns
   it to `@copilot`.
3. Copilot authors the pull request.
4. A human reviews and merges the pull request.
5. A human performs the controlled deployment and validates recovery.

This preserves an auditable GitOps trail. Do not use Azure CLI, the portal, or
an SRE Agent action to make an unreviewed production change.

## Approved manual fallback

Only when the issue → Copilot pull request → human merge → controlled deploy
path cannot be used, an authorized human may run the constrained fallback.
The approval gate accepts only `CHG-<number>` or `INC-<number>` tickets and
requires the exact confirmation `APPROVE`.

```powershell
.\scenarios\cpu-runaway\tools\Invoke-ApprovedRemediation.ps1 `
  -Action stop-cpu-runaway `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -ChangeTicket CHG-12345
```

The manual fallback stops only the recorded CPU workload and writes an audit
entry under `scenarios/cpu-runaway/output/`.
