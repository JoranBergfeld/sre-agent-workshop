# Module 90: Watch the SRE Agent

The expected investigation chain is:

```text
Simulated or real Service Health advisory
  → extract retiring SKUs and deadline
  → Azure Resource Graph inventories every affected VM
  → issue records evidence and migration plan
  → @copilot authors the change
  → human review, merge, and controlled deployment
  → validation confirms no retiring SKU remains
```

The normal recovery contract is **one issue assigned to `@copilot` → Copilot
PR → human merge/controlled deploy**. The SRE Agent must not resize VMs
directly, merge a PR, or trigger an uncontrolled deployment.

The issue should contain:

- the Service Health tracking ID and retirement date;
- the retiring SKUs and affected VM inventory;
- the target `Standard_D2s_v5` size and expected disruption;
- the validation command and completion criteria.

## Manual approved fallback

Only when the issue-to-Copilot flow is unavailable, an authorized operator can
execute the capsule's direct-action fallback:

```bash
./scenarios/vm-size-retirement/scripts/tools/invoke-approved-remediation.sh \
  --action migrate-vm-size --resource-group rg-srelabretirement \
  --change-ticket CHG-12345
```

```powershell
./scenarios/vm-size-retirement/scripts/tools/Invoke-ApprovedRemediation.ps1 `
  -Action migrate-vm-size -ResourceGroup rg-srelabretirement `
  -ChangeTicket CHG-12345
```

The local gate validates the `CHG-`/`INC-` ticket, waits for `APPROVE`, runs
only the capsule remediation script, and writes an audit record.

## Validate

```bash
./scenarios/vm-size-retirement/scripts/validate.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/validate.ps1
```

Continue to [99 Cleanup](./99-cleanup.md) when recovery is confirmed.
