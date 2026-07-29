# Module 01: Deploy Infrastructure

Run commands from the repository root. The direct entry point
`scenarios/iis-app-pool/infra/bicep/main.bicep` deploys only this capsule:

- two Windows Server IIS VMs and daily auto-shutdown
- VNet, NSG, and Azure Bastion access
- Log Analytics, Application Insights, and an investigation identity
- the `vm-iis-app-pool-failure` alert, scoped directly to this capsule's Log
  Analytics workspace

Create the resource group and deploy with the capsule defaults:

```bash
az group create --name rg-srelabiisapppool --location eastus2
az deployment group create \
  --resource-group rg-srelabiisapppool \
  --template-file scenarios/iis-app-pool/infra/bicep/main.bicep \
  --parameters scenarios/iis-app-pool/infra/bicep/main.bicepparam \
  --parameters adminPassword='<strong-password>'
```

Capture the deployment outputs for later modules:

```bash
az deployment group show \
  --resource-group rg-srelabiisapppool \
  --name <deployment-name> \
  --query properties.outputs -o json
```

Open an HTTP tunnel when you need to inspect IIS locally:

```bash
./scenarios/iis-app-pool/scripts/access/start-http-tunnel.sh
```

Next: [02 Configure incident response](./02-configure-incident-response.md).
