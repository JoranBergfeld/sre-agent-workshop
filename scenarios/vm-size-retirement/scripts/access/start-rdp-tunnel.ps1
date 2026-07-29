param(
    [string]$ResourceGroup = "rg-srelabretirement",
    [string]$VmName = "srelabretirement-vm01",
    [string]$BastionName = "srelabretirement-bas",
    [int]$LocalPort = 13389
)

$ErrorActionPreference = 'Stop'
$vmId = az vm show --resource-group $ResourceGroup --name $VmName --query id -o tsv
if ($LASTEXITCODE -ne 0 -or -not $vmId) {
    throw "Unable to resolve VM resource ID."
}

Write-Host "Starting Bastion RDP tunnel: localhost:$LocalPort -> $VmName:3389"
az network bastion tunnel `
    --name $BastionName `
    --resource-group $ResourceGroup `
    --target-resource-id $vmId `
    --resource-port 3389 `
    --port $LocalPort
