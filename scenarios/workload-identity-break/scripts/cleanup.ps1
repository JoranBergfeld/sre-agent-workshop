# Tears down all Azure resources created by the workshop.
# Usage from repository root:
#   .\scenarios\workload-identity-break\scripts\cleanup.ps1
#   .\scenarios\workload-identity-break\scripts\cleanup.ps1 -ResourceGroup rg-myworkshop
#   .\scenarios\workload-identity-break\scripts\cleanup.ps1 --resource-group rg-srelabidentity --yes

param()

$ErrorActionPreference = 'Stop'
$ResourceGroup = 'rg-srelabidentity'
$Yes = $false
$DryRun = $false

function Show-Usage {
    @"
Usage: .\cleanup.ps1 [--resource-group <name>] [--yes] [--dry-run]

Options:
  -g, -ResourceGroup, --resource-group <name>  Resource group to delete (default: rg-srelabidentity)
  -y, -Yes, --yes                              Skip the confirmation prompt
      --dry-run                                Show the selected resource group without deleting it
  -h, --help                                   Show this help
"@ | Write-Host
}

for ($index = 0; $index -lt $args.Count; $index++) {
    $argument = $args[$index]
    switch ($argument) {
        '-g' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
        }
        '-ResourceGroup' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
        }
        '--resource-group' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
        }
        '-y' { $Yes = $true }
        '-Yes' { $Yes = $true }
        '--yes' { $Yes = $true }
        '--dry-run' { $DryRun = $true }
        '-h' { Show-Usage; exit 0 }
        '--help' { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

Write-Host "========================================"
Write-Host "  SRE Agent Workshop — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"
Write-Host ""

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

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
