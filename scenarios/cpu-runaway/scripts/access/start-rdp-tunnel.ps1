param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01",
    [string]$BastionName = "srelabcpurunaway-bas",
    [int]$LocalPort = 13389,
    [string]$VmUser = "azureuser"
)

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
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
