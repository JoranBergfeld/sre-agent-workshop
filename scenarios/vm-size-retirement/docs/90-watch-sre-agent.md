# Module 90: Watch the SRE Agent

The expected investigation chain is:

```text
Simulated or real Service Health advisory
  → extract retiring SKUs and deadline
  → Azure Resource Graph inventories every affected VM
  → operator reviews the migration plan
  → valid CHG/INC ticket enters the approval gate
  → operator types exact APPROVE
  → audited resize action runs
  → validation confirms no retiring SKU remains
```

The normal recovery contract is the local approval gate. The SRE Agent must not
resize VMs directly. An authorized operator reviews the affected fleet and
deadline, provides a valid ticket, then confirms the action with exact
`APPROVE`.

The approval record should contain:

- the Service Health tracking ID and retirement date;
- the retiring SKUs and affected VM inventory;
- the target `Standard_D2s_v5` size and expected disruption;
- the validation command and completion criteria.

## Approval-gated migration

After reviewing the inventory, the authorized operator executes the
capsule's only remediation action:

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

The local gate validates the `CHG-`/`INC-` ticket, waits for exact `APPROVE`,
runs only the capsule remediation script, and writes an audit record.

## Validate

```bash
./scenarios/vm-size-retirement/scripts/validate.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/validate.ps1
```

Continue to [99 Cleanup](./99-cleanup.md) when recovery is confirmed.
