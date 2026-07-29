param()

$ErrorActionPreference = 'Stop'
$ResourceGroup = 'rg-srelabcpurunaway'
$Yes = $false
$DryRun = $false

function Show-Usage {
    @"
Usage: .\cleanup.ps1 [--resource-group <name>] [--yes] [--dry-run]

Options:
  -g, -ResourceGroup, --resource-group <name>  Resource group to delete (default: rg-srelabcpurunaway)
  -y, -Yes, --yes                              Skip the confirmation prompt
      -DryRun, --dry-run                       Show the selected resource group without deleting it
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
        '-DryRun' { $DryRun = $true }
        '--dry-run' { $DryRun = $true }
        '-h' { Show-Usage; exit 0 }
        '--help' { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

Write-Host "========================================"
Write-Host "  CPU Runaway Scenario — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

$groupShowOutput = & az group show --name $ResourceGroup 2>&1
if ($LASTEXITCODE -ne 0) {
    $errorDetails = ($groupShowOutput | Out-String).Trim()
    if ($errorDetails -match 'ResourceGroupNotFound|could not be found') {
        Write-Host "Resource group not found. Nothing to delete."
        exit 0
    }
    throw $errorDetails
}

if (-not $Yes) {
    $confirm = Read-Host "Delete resource group '$ResourceGroup'? [y/N]"
    if ($confirm -notmatch '^[Yy]$') {
        Write-Host "Cancelled."
        exit 0
    }
}

az group delete --name $ResourceGroup --yes --no-wait
if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI failed to start deletion for resource group '$ResourceGroup'."
}
Write-Host "Deletion started."
