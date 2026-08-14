# Module 99: Cleanup

Delete the scenario resource group when you finish. Deletion starts
asynchronously because `--no-wait` is used.

## Delete Azure resources

Bash:

```bash
scenarios/cloud-agent-handover/scripts/cleanup.sh
```

For a custom resource group:

```bash
scenarios/cloud-agent-handover/scripts/cleanup.sh rg-myworkload
```

PowerShell 7:

```powershell
scenarios/cloud-agent-handover/scripts/cleanup.ps1
```

For a custom resource group:

```powershell
scenarios/cloud-agent-handover/scripts/cleanup.ps1 -ResourceGroup rg-myworkload
```

The scripts call `az group delete --yes --no-wait`. The resource group contains
the B1 App Service and monitoring resources. If you created the SRE Agent in
this resource group, it is removed as well.

Check deletion safely:

```bash
az group exists --name rg-srelabapp
```

```powershell
az group exists --name rg-srelabapp
```

If setup used a custom workload, replace `rg-srelabapp` with its resource
group name.

The expected result is `false` after Azure finishes deletion.

## Optional GitHub cleanup

Remove the repository metadata variables created by setup if you want to
retain the generated repository without its Azure resource references.

Bash:

```bash
for variable in \
  AZURE_RESOURCE_GROUP AZURE_WEBAPP_NAME AZURE_LOCATION WORKLOAD_NAME; do
  gh variable delete "$variable"
done
gh variable list
```

PowerShell 7:

```powershell
$Variables = @(
  "AZURE_RESOURCE_GROUP",
  "AZURE_WEBAPP_NAME",
  "AZURE_LOCATION",
  "WORKLOAD_NAME"
)
$Variables | ForEach-Object { gh variable delete $_ }
gh variable list
```

To remove the generated repository entirely, use its GitHub **Settings →
General → Danger Zone** page, or run this irreversible command from its clone:

```bash
gh repo delete "$(gh repo view --json nameWithOwner --jq .nameWithOwner)" --yes
```

Cleanup is complete when `az group exists` returns `false` and any optional
GitHub items you selected are no longer listed.
