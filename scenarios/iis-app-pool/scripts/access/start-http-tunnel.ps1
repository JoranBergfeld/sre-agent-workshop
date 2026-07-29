param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisapppool-vm01",
    [string]$BastionName = "srelabiisapppool-bas",
    [int]$LocalPort = 18080
)

$vmId = az vm show --resource-group $ResourceGroup --name $VmName --query "id" -o tsv
if ($LASTEXITCODE -ne 0 -or -not $vmId) {
    throw "Unable to resolve VM resource ID."
}

Write-Host "Starting Bastion HTTP tunnel: localhost:$LocalPort -> $VmName:80"
az network bastion tunnel `
  --name $BastionName `
  --resource-group $ResourceGroup `
  --target-resource-id $vmId `
  --resource-port 80 `
  --port $LocalPort
