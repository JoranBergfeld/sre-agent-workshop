# Module 01: Deploy Infrastructure

Run commands from the repository root. The scenario Bicep is fully contained
under `scenarios/disk-full/infra/bicep/`: `main.bicep` composes monitoring,
network, VM, and identity modules, then deploys
`modules/alert.bicep` directly against the Log Analytics resource ID.

The default workload is `srelabdiskfull`, which creates
`srelabdiskfull-vm01`, `srelabdiskfull-vm02`, and
`srelabdiskfull-bas`. For a unique custom workload, replace
`srelabdiskfull` everywhere below; for example,
`srelabdiskfulljordan` creates `srelabdiskfulljordan-vm01`.
The Windows `computerName` values remain `sredisk01` and `sredisk02` so they
stay within the Windows 15-character limit; Azure Monitor Perf records use
these computer names rather than the longer ARM VM names.

```bash
export RESOURCE_GROUP=rg-srelabdiskfull
export LOCATION=eastus2
export WORKLOAD_NAME=srelabdiskfull
read -rsp "Windows VM administrator password: " VM_ADMIN_PASSWORD; echo

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file scenarios/disk-full/infra/bicep/main.bicep \
  --parameters scenarios/disk-full/infra/bicep/main.bicepparam \
  workloadName="$WORKLOAD_NAME" \
  adminPassword="$VM_ADMIN_PASSWORD"
```

```powershell
$resourceGroup = 'rg-srelabdiskfull'
$location = 'eastus2'
$workloadName = 'srelabdiskfull'
$adminPassword = ConvertFrom-SecureString `
  (Read-Host 'Windows VM administrator password' -AsSecureString) `
  -AsPlainText

az group create --name $resourceGroup --location $location
az deployment group create `
  --resource-group $resourceGroup `
  --template-file scenarios/disk-full/infra/bicep/main.bicep `
  --parameters scenarios/disk-full/infra/bicep/main.bicepparam `
  workloadName=$workloadName `
  adminPassword=$adminPassword
```

Capture the deployment outputs for the ARM VM names, Windows computer names,
Bastion name, and Log Analytics workspace ID. The deployment associates the
Azure Monitor Agent on both VMs with a data collection rule that sends
`\LogicalDisk(C:)\% Free Space` to that workspace. Access is Bastion-only;
no VM NIC has a public IP.

```bash
./scenarios/disk-full/scripts/access/start-http-tunnel.sh \
  --resource-group rg-srelabdiskfull \
  --vm-name srelabdiskfull-vm01 \
  --bastion-name srelabdiskfull-bas
```
