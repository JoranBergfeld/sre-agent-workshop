param(
    [string]$ResourceGroup = "rg-srelabretirement"
)

$ErrorActionPreference = 'Stop'
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$filter = "[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
$remaining = & az vm list --resource-group $ResourceGroup --query $filter -o tsv
if ($LASTEXITCODE -ne 0) {
    throw "az vm list failed with exit code $LASTEXITCODE."
}

if ($remaining -and $remaining.Trim().Length -gt 0) {
    Write-Error "FAIL: VMs still on a retiring size:`n$remaining"
    exit 1
}

Write-Host "PASS: no VMs on a retiring size in $ResourceGroup."
