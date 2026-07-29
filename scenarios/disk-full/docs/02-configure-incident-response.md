# Module 02: Configure Incident Response

Connect the SRE Agent to Azure Monitor and scope its plan to the Disk Full
scenario's `VM Disk Free Space Critical` alert. The alert is owned directly by
`scenarios/disk-full/infra/bicep/modules/alert.bicep` and queries C: `% Free
Space` from the scenario's Log Analytics workspace.

Configure the incident response plan to collect the local
`investigation/query.kql` evidence and follow this exact recovery flow:

1. Record the evidence in **one GitHub issue** and assign it to `@copilot`.
2. Copilot authors the remediation **PR**.
3. A human reviews and merges the Copilot PR.
4. An authorized human performs the controlled Bicep deployment of the merged
   change.

The SRE Agent must not delete files or invoke Azure run commands as the normal
path. If recovery cannot wait for the issue → `@copilot` → Copilot PR → human
merge → controlled deployment flow, an authorized operator may use only the
scenario-owned approval gate. It requires a valid `CHG-<number>` or
`INC-<number>` ticket and the exact uppercase `APPROVE` confirmation. Every
approved execution is recorded in `output/actions-audit.log`.

```bash
./scenarios/disk-full/tools/invoke-approved-remediation.sh \
  --action cleanup-disk --change-ticket INC-12345
```

The alternative `cleanup-temp` action is broader: it removes all content under
`C:\Temp`, so use it only when the ticket explicitly authorizes that scope.
