# VM Size Retirement Operational Guidelines

## Incident policy

1. Preserve the advisory tracking ID, retirement date, retiring SKU list, and
   Azure Resource Graph inventory as incident evidence.
2. Treat injector output as a simulated advisory; do not represent it as a
   production Service Health event.
3. Do not resize VMs directly. The SRE Agent proposes the migration but never
   invokes the remediation script.
4. The normal remediation path is the local approval gate. An authorized
   operator reviews the evidence, supplies a `CHG-<number>` or
   `INC-<number>` ticket, and types exact `APPROVE`.
5. The gate executes only `migrate-vm-size`, records an audit entry in
   `output/`, and migrates the full affected fleet.
6. Close the incident only after validation finds no retiring SKU.

## Approval-gated remediation

Use `scripts/tools/invoke-approved-remediation.sh` or
`scripts/tools/Invoke-ApprovedRemediation.ps1`. The approval gate is required
for every migration; there is no alternate direct-action path.
