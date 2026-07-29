param()

$ErrorActionPreference = 'Stop'
$Workload = 'srelabretirement'
$ResourceGroup = "rg-$Workload"
$ResourceGroupSet = $false
$Yes = $false
$DryRun = $false

function Show-Usage {
    Write-Host "Usage: .\cleanup.ps1 [--workload <name>] [--resource-group <name>] [--yes] [--dry-run]"
}

for ($index = 0; $index -lt $args.Count; $index++) {
    $argument = $args[$index]
    switch ($argument) {
        '-w' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $Workload = $args[$index]
            if (-not $ResourceGroupSet) { $ResourceGroup = "rg-$Workload" }
        }
        '--workload' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $Workload = $args[$index]
            if (-not $ResourceGroupSet) { $ResourceGroup = "rg-$Workload" }
        }
        '-g' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
            $ResourceGroupSet = $true
        }
        '-ResourceGroup' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
            $ResourceGroupSet = $true
        }
        '--resource-group' {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
            $ResourceGroupSet = $true
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

Write-Host "Resource group: $ResourceGroup"

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

$resource = az group show --name $ResourceGroup 2>$null
if (-not $resource) {
    Write-Host "Resource group '$ResourceGroup' not found. Nothing to delete."
    exit 0
}

if (-not $Yes) {
    $confirmation = Read-Host "Delete resource group '$ResourceGroup' and ALL resources inside? [y/N]"
    if ($confirmation -notmatch '^[Yy]$') {
        Write-Host "Cancelled."
        exit 0
    }
}

& az group delete --name $ResourceGroup --yes --no-wait
if ($LASTEXITCODE -ne 0) {
    throw "Command 'az group delete' failed with exit code $LASTEXITCODE."
}

Write-Host "Deletion started."
