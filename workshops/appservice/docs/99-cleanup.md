# Module 99: Cleanup

Delete the workshop resource group when you finish. Deletion starts
asynchronously because `--no-wait` is used.

## Delete Azure resources

Bash:

```bash
workshops/appservice/scripts/cleanup.sh
```

For a custom resource group:

```bash
workshops/appservice/scripts/cleanup.sh rg-myworkload
```

PowerShell 7:

```powershell
./workshops/appservice/scripts/cleanup.ps1
```

For a custom resource group:

```powershell
./workshops/appservice/scripts/cleanup.ps1 -ResourceGroup rg-myworkload
```

The scripts call `az group delete --yes --no-wait`. The resource group contains
the B1 App Service, monitoring resources, GitHub deployment user-assigned
managed identity, and its federated identity credential (FIC). If you created
the SRE Agent in this resource group, it is removed as well.

Check deletion safely:

```bash
az group exists --name "$RESOURCE_GROUP"
```

```powershell
az group exists --name $ResourceGroup
```

The expected result is `false` after Azure finishes deletion.

## Optional GitHub cleanup

Remove the repository variables created by setup if you want to retain the
generated repository without its Azure deployment configuration.

Bash:

```bash
for variable in \
  AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID \
  AZURE_RESOURCE_GROUP AZURE_WEBAPP_NAME AZURE_LOCATION WORKLOAD_NAME; do
  gh variable delete "$variable"
done
gh variable list
```

PowerShell 7:

```powershell
$Variables = @(
  "AZURE_CLIENT_ID",
  "AZURE_TENANT_ID",
  "AZURE_SUBSCRIPTION_ID",
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
