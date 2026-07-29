# Operational Guidelines

## Required remediation path

The SRE Agent investigates the IIS app-pool alert and records the evidence.
An authorized operator then uses only the capsule-local approval gate. It
requires a `CHG-<number>` or `INC-<number>` ticket, exact `APPROVE`
confirmation, and writes an audit record:

```bash
./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh \
  --action start-iis-app-pool \
  --resource-group rg-srelabiisapppool \
  --vm-name srelabiisa-01 \
  --change-ticket CHG-12345
```

The gate may execute only
`scripts/remediation/start-iis-app-pool.{sh,ps1}`. After the prompt, type
`APPROVE` exactly; the gate writes `output/actions-audit.log` with the ticket,
action, resource group, VM, timestamp, and execution status. GitHub context,
an issue, or a code change does not replace this approval and audit process.
