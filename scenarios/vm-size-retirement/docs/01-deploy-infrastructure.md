# Module 1: Deploy Infrastructure

Create the default resource group and provide a strong Windows administrator
password through your shell environment. Run these commands from the repository
root.

```bash
export VM_ADMIN_PASSWORD='replace-with-a-strong-password'
az group create --name rg-srelabretirement --location eastus2
az deployment group create \
  --resource-group rg-srelabretirement \
  --template-file ./scenarios/vm-size-retirement/infra/bicep/main.bicep \
  --parameters ./scenarios/vm-size-retirement/infra/bicep/main.bicepparam \
  --parameters adminPassword="$VM_ADMIN_PASSWORD"
```

```powershell
$env:VM_ADMIN_PASSWORD = 'replace-with-a-strong-password'
az group create --name rg-srelabretirement --location eastus2
az deployment group create `
  --resource-group rg-srelabretirement `
  --template-file ./scenarios/vm-size-retirement/infra/bicep/main.bicep `
  --parameters ./scenarios/vm-size-retirement/infra/bicep/main.bicepparam `
  --parameters adminPassword=$env:VM_ADMIN_PASSWORD
```

The deployment creates two `Standard_B2s` IIS VMs, a Bastion-first network,
monitoring resources, and a read-only operations identity. The resources are
tagged exactly with `scenario: vm-size-retirement` and `environment: demo`.

`main.bicep` deliberately has no scenario-alerts module. The standalone
`service-health-alert.bicep` is a production reference for a real
subscription-scoped Service Health route; it is not part of the workshop
deployment.

## Access

Use Bastion rather than public VM addresses:

```bash
./scenarios/vm-size-retirement/scripts/access/start-http-tunnel.sh
```

```powershell
./scenarios/vm-size-retirement/scripts/access/start-rdp-tunnel.ps1
```

Continue to [02 Configure incident response](./02-configure-incident-response.md).
