# Module 02: Configure Incident Response

Connect the SRE Agent to Azure Monitor and scope its plan to the Arc-Enabled Server Disk Pressure
scenario's `Arc Disk Free Space Critical` alert. The alert is owned directly by
`scenarios/arc-disk-pressure/infra/bicep/modules/alert.bicep` and queries C: `% Free
Space` from the scenario's Log Analytics workspace.

Configure the incident response plan to collect the local
`investigation/query.kql` evidence and follow this exact recovery flow:

1. Record the evidence in the investigation trace and postmortem.
2. Review the proposed surgical cleanup and its evidence snapshot.
3. Supply a `CHG-<number>` or `INC-<number>` ticket and invoke the approval gate
   with the exact uppercase `APPROVE` confirmation.
4. If Arc is unhealthy, require fresh approval and perform the bounded cleanup
   locally on the host.

The SRE Agent investigates and proposes only. The learner invokes the
scenario-owned approval gate, which executes surgical cleanup through Arc Run
Command on the normal path. Every approved execution is recorded in
`output/actions-audit.log`; failed and rejected attempts must fail closed.

```bash
./scenarios/arc-disk-pressure/tools/invoke-approved-remediation.sh \
  --action cleanup-arc-disk-pressure --change-ticket INC-12345
```

The `cleanup-arc-disk-pressure` action is intentionally narrow: it stops only the
positively attributed injector and removes only its marker, ownership record, PID,
and `C:\Temp\diskfill` artifacts. It never performs broad temporary-folder cleanup.
