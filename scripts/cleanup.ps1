# Tears down all Azure resources created by the workshop.
# Usage: .\scripts\cleanup.ps1
#        .\scripts\cleanup.ps1 -ResourceGroup rg-myworkshop
#        .\scripts\cleanup.ps1 -ResourceGroup rg-srelab -Yes

param(
    [string]$ResourceGroup = "rg-srelab",
    [switch]$Yes
)

Write-Host "========================================"
Write-Host "  SRE Agent Workshop — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"
Write-Host ""

# Verify the resource group exists
$rg = az group show --name $ResourceGroup 2>$null
if (-not $rg) {
    Write-Host "Resource group '$ResourceGroup' not found. Nothing to delete."
    exit 0
}

# Confirm unless -Yes
if (-not $Yes) {
    $confirm = Read-Host "Delete resource group '$ResourceGroup' and ALL resources inside? [y/N]"
    if ($confirm -notmatch '^[Yy]$') {
        Write-Host "Cancelled."
        exit 0
    }
}

Write-Host "Deleting resource group '$ResourceGroup' (async)..."
az group delete --name $ResourceGroup --yes --no-wait

Write-Host ""
Write-Host "========================================"
Write-Host "  Deletion started (runs in background)."
Write-Host "  Monitor: az group show -n $ResourceGroup"
Write-Host "========================================"
