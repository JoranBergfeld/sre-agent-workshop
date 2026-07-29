# Operational Guidelines

## Required remediation path

The SRE Agent investigates the IIS app-pool alert and records the evidence.
A human then creates or explicitly approves exactly one GitHub issue describing
the stopped `DefaultAppPool`, affected VM, telemetry, and required recovery.
Assign that issue to `@copilot`.

Copilot authors the pull request. A human reviews and merges the pull request,
then deploys the merged change using this capsule's infrastructure deployment
process. This preserves the complete incident → issue → Copilot PR → human
merge → deployment audit trail.

## Manual fallback

When the issue-to-Copilot path cannot be used, an authorized operator may use
only the capsule-local approval gate. It requires a `CHG-<number>` or
`INC-<number>` ticket, an exact `APPROVE` response, and writes an audit record:

```bash
./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh \
  --action start-iis-app-pool \
  --resource-group rg-srelabiisapppool \
  --vm-name srelabiisa-01 \
  --change-ticket CHG-12345
```

The gate may execute only
`scripts/remediation/start-iis-app-pool.{sh,ps1}`. Reconcile any fallback with
the issue and Copilot pull request afterward.
