param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [switch]$Yes
)

Write-Host "========================================"
Write-Host "  IIS App Pool Failure — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

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
