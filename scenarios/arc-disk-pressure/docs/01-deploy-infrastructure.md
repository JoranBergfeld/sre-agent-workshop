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

Create and designate an unused resource group once (the tooling never creates
or deletes groups; its region is only metadata):

```bash
az group exists --name rg-srelabarcdisk   # must print false
az group create --name rg-srelabarcdisk --location eastus2 --tags sre-workshop-scenario=arc-disk-pressure
```

Deploy through the **Deploy Arc Disk Pressure Infrastructure** workflow, or
manually with the placement engine. Use the region it reports (`location` in
the outputs file) for Arc onboarding:

```bash
export RESOURCE_GROUP=rg-srelabarcdisk
export WORKLOAD_NAME=srelabarcdisk
read -rsp "Windows VM administrator password: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
node scripts/placement/provision.mjs deploy arc-disk-pressure \
  --location eastus2 --workload "$WORKLOAD_NAME" \
  --secure-param-env adminPassword=ADMIN_PASSWORD \
  --outputs-file arc-disk-pressure-outputs.json
export LOCATION=$(az group show --name "$RESOURCE_GROUP" --query "tags.\"sre-workshop-location\"" -o tsv)
```

```powershell
$resourceGroup = 'rg-srelabarcdisk'
$workloadName = 'srelabarcdisk'
$env:ADMIN_PASSWORD = ConvertFrom-SecureString `
  (Read-Host 'Windows VM administrator password' -AsSecureString) -AsPlainText
node scripts/placement/provision.mjs deploy arc-disk-pressure `
  --location eastus2 --workload $workloadName `
  --secure-param-env adminPassword=ADMIN_PASSWORD `
  --outputs-file arc-disk-pressure-outputs.json
$location = az group show --name $resourceGroup --query 'tags."sre-workshop-location"' -o tsv
```

The engine checks SKU restrictions, capabilities and vCPU quota for the whole
fleet, then tries the VM sizes in `infra/placement.json` (D2s v7 first, then compatible small D2s/D2as generations) in a region
before falling back to Sweden Central and Australia East. It records the
region and size it used on the resource group; reruns stay pinned to them and
never resize, relocate or delete anything. See
[Region and VM-size fallback](../../../docs/region-and-sku-fallback.md).
Requires Node.js 20+.

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
