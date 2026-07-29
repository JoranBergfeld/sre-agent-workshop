param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisa-01",
    [string]$BastionName = "srelabiisapppool-bas",
    [int]$LocalPort = 13389,
    [string]$VmUser = "azureuser"
)

$vmId = az vm show --resource-group $ResourceGroup --name $VmName --query "id" -o tsv
if ($LASTEXITCODE -ne 0 -or -not $vmId) {
    throw "Unable to resolve VM resource ID."
}

Write-Host "Starting Bastion RDP tunnel: localhost:$LocalPort -> $VmName:3389"
Write-Host "Then connect with mstsc to 127.0.0.1:$LocalPort"
Write-Host "Username: $VmUser"

az network bastion tunnel `
  --name $BastionName `
  --resource-group $ResourceGroup `
  --target-resource-id $vmId `
  --resource-port 3389 `
  --port $LocalPort
