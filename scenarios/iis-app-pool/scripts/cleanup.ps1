param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [switch]$Yes,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "  IIS App Pool Failure — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

$rg = & az group show --name $ResourceGroup 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed while checking resource group '$ResourceGroup'."
}
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

& az group delete --name $ResourceGroup --yes --no-wait
if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed while deleting resource group '$ResourceGroup'."
}
Write-Host "Deletion started."
