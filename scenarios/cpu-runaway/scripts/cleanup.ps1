param()

$ErrorActionPreference = 'Stop'
$ResourceGroup = 'rg-srelabcpurunaway'
$Yes = $false

function Show-Usage {
    @"
Usage: .\cleanup.ps1 [--resource-group <name>] [--yes]

Options:
  -g, -ResourceGroup, --resource-group <name>  Resource group to delete (default: rg-srelabcpurunaway)
  -y, -Yes, --yes                              Skip the confirmation prompt
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
        '-h' { Show-Usage; exit 0 }
        '--help' { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

Write-Host "========================================"
Write-Host "  CPU Runaway Scenario — Cleanup"
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
