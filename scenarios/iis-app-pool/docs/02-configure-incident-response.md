# Module 02: Configure Incident Response

Connect Azure Monitor as the SRE Agent incident platform and create a
**Review** response plan. Review mode lets the agent investigate the alert and
propose a recovery while retaining human control of changes.

This capsule directly deploys its scheduled-query rule. Verify it after
deployment:

```bash
az resource list \
  --resource-group rg-srelabiisapppool \
  --resource-type Microsoft.Insights/scheduledQueryRules \
  --query "[].{name:name,displayName:properties.displayName}" -o table
```

Look for `srelabiisapppool-vm-iis-app-pool-failure`, displayed as **IIS App
Pool Failure**. The alert queries `Event` records for IIS/System events whose
descriptions contain `stopped` or `terminated`.

When it fires, the SRE Agent investigates the local
[`investigation/query.kql`](../investigation/query.kql) and records evidence.
The remediation path is the capsule-local approval gate: an authorized
operator supplies a `CHG-<number>` or `INC-<number>` ticket and types
`APPROVE` exactly at its prompt. The gate writes
`output/actions-audit.log`; no external workflow substitutes for that ticket,
confirmation, and audit trail.

Next: [04 Onboard the SRE Agent and GitHub context](./04-onboard-sre-agent.md).
