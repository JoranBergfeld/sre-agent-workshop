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
