# 02 Configure Incident Response

Configure the SRE Agent to observe the `vm-cpu-runaway` Azure Monitor alert
and investigate the `Perf` CPU signal. The SRE Agent may diagnose and propose
the approved action, but it must not run direct remediation.

## Required approval and recovery flow

1. The SRE Agent collects alert and VM evidence, then presents its diagnosis.
2. An authorized human invokes the approval gate with a `CHG-<number>` or
   `INC-<number>` ticket and types the exact confirmation `APPROVE`.
3. The gate runs only `stop-cpu-runaway` and writes an audit entry.
4. The operator validates recovery and closes the incident.

The approval gate is the normal remediation path. Do not allow an SRE Agent
to run the action directly.

## Optional collaboration

GitHub issues and Copilot can help record the diagnosis, improve
documentation, or prepare a reviewed infrastructure change. They cannot
replace the approval gate or directly run remediation.

```powershell
.\scenarios\cpu-runaway\tools\Invoke-ApprovedRemediation.ps1 `
  -Action stop-cpu-runaway `
  -ResourceGroup rg-srelabcpurunaway `
  -VmName srelabcpurunaway-vm01 `
  -ChangeTicket CHG-12345
```

The gate stops only the recorded CPU workers and writes an audit entry under
`scenarios/cpu-runaway/output/`.
