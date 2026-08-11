param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [switch]$Yes,
    [switch]$DryRun
)

Write-Host "========================================"
Write-Host "  Disk Full Scenario — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$rg = az group show --name $ResourceGroup 2>$null
if (-not $rg) {
    Write-Host "Resource group not found. Nothing to delete."
    exit 0
}

if (-not $Yes) {
    $confirm = Read-Host "Delete resource group '$ResourceGroup'? [y/N]"
    if ($confirm -notmatch '^[Yy]$') {
        Write-Host "Cancelled."
        exit 0
    }
}

az group delete --name $ResourceGroup --yes --no-wait
Write-Host "Deletion started."
