# VM Size Retirement Operational Guidelines

## Incident policy

1. Preserve the advisory tracking ID, retirement date, retiring SKU list, and
   Azure Resource Graph inventory as incident evidence.
2. Treat injector output as a simulated advisory; do not represent it as a
   production Service Health event.
3. Do not resize VMs directly during normal response.
4. Create one GitHub issue with the evidence and migration plan, assigned to
   `@copilot`.
5. Copilot authors the pull request. A human reviews and merges it, then
   controls the deployment window.
6. Close the incident only after validation finds no retiring SKU.

The normal handoff is exactly: **issue assigned to `@copilot` → Copilot PR →
human merge/controlled deploy**.

## Approved manual fallback

If the GitOps path is unavailable and an urgent resize is authorized, an
operator may invoke `scripts/tools/invoke-approved-remediation.sh` or
`scripts/tools/Invoke-ApprovedRemediation.ps1`. The gate requires a
`CHG-<number>` or `INC-<number>` ticket and an explicit `APPROVE` response,
executes only `migrate-vm-size`, and records an audit entry in `output/`.
