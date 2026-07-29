# Disk Full Scenario Operational Guidelines

## Controlled recovery

Use the normal recovery path exactly: incident evidence → one GitHub issue
assigned to `@copilot` → Copilot PR → human review and merge → controlled
Bicep deployment by an authorized human. The scenario infrastructure is owned
by `scenarios/disk-full/infra/bicep/`; do not make untracked Azure changes.

## Approved manual fallback

Direct disk cleanup is allowed only when the normal flow cannot restore service
in time. An authorized operator must invoke
`tools/invoke-approved-remediation.{sh,ps1}` with a valid `CHG-` or `INC-`
ticket and type the exact confirmation `APPROVE`. The gate resolves only
`scripts/remediation/cleanup-disk` and `scripts/remediation/cleanup-temp`,
then appends an execution record to `output/actions-audit.log`.

`cleanup-disk` stops the injected loop and removes only
`C:\Temp\diskfill` artifacts. `cleanup-temp` has a broader `C:\Temp` scope and
requires explicit ticket authorization.
