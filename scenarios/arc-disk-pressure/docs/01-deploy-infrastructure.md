# Module 01: Deploy Infrastructure

Run commands from the repository root. The scenario Bicep is fully contained
under `scenarios/arc-disk-pressure/infra/bicep/`: `main.bicep` composes monitoring,
network, VM, and identity modules, then deploys
`modules/alert.bicep` directly against the Log Analytics resource ID.

The default workload is `srelabarcdisk`, which creates
`srelabarcdisk-vm01` and `srelabarcdisk-bas`. For a unique custom workload,
replace `srelabarcdisk` everywhere below; for example,
`srelabarcdiskjordan` creates `srelabarcdiskjordan-vm01`.
The Windows `computerName` is `srearc01`, matching the alert and investigation
queries; Azure Monitor Perf records use this name rather than the longer ARM
VM name.

```bash
export RESOURCE_GROUP=rg-srelabarcdisk
export LOCATION=eastus2
export WORKLOAD_NAME=srelabarcdisk
read -rsp "Windows VM administrator password: " VM_ADMIN_PASSWORD; echo

az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file scenarios/arc-disk-pressure/infra/bicep/main.bicep \
  --parameters scenarios/arc-disk-pressure/infra/bicep/main.bicepparam \
  workloadName="$WORKLOAD_NAME" \
  adminPassword="$VM_ADMIN_PASSWORD"
```

```powershell
$resourceGroup = 'rg-srelabarcdisk'
$location = 'eastus2'
$workloadName = 'srelabarcdisk'
$adminPassword = ConvertFrom-SecureString `
  (Read-Host 'Windows VM administrator password' -AsSecureString) `
  -AsPlainText

az group create --name $resourceGroup --location $location
az deployment group create `
  --resource-group $resourceGroup `
  --template-file scenarios/arc-disk-pressure/infra/bicep/main.bicep `
  --parameters scenarios/arc-disk-pressure/infra/bicep/main.bicepparam `
  workloadName=$workloadName `
  adminPassword=$adminPassword
```

Capture the deployment outputs for the ARM VM name, Windows computer name,
Bastion name, and Log Analytics workspace ID. Then onboard the evaluation host
to Arc. Onboarding installs Azure Monitor Agent through Arc and associates the
data collection rule that sends `\LogicalDisk(C:)\% Free Space` to the
workspace.

```bash
./scenarios/arc-disk-pressure/scripts/onboard-arc.sh \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "${WORKLOAD_NAME}-vm01" \
  --location "$LOCATION"
```

```powershell
./scenarios/arc-disk-pressure/scripts/onboard-arc.ps1 `
  -ResourceGroup $resourceGroup `
  -VmName "$workloadName-vm01" `
  -Location $location
```

Access is Bastion-only; the VM NIC has no public IP.

```bash
./scenarios/arc-disk-pressure/scripts/access/start-http-tunnel.sh \
  --resource-group rg-srelabarcdisk \
  --machine-name srelabarcdisk-vm01 \
  --bastion-name srelabarcdisk-bas
```
