# Tears down all Azure resources created by the workshop.
# Usage from repository root:
#   .\scenarios\cosmos-rbac-removal\scripts\cleanup.ps1
#   .\scenarios\cosmos-rbac-removal\scripts\cleanup.ps1 -ResourceGroup rg-myworkshop
#   .\scenarios\cosmos-rbac-removal\scripts\cleanup.ps1 --resource-group rg-srelabcosmos --yes

param()

$ErrorActionPreference = 'Stop'
$ResourceGroup = 'rg-srelabcosmos'
$Workload = 'srelabcosmos'
$ResourceGroupSet = $false
$Yes = $false
$DryRun = $false

function Show-Usage {
    @"
Usage: .\cleanup.ps1 [--resource-group <name>] [--workload <name>] [--yes] [--dry-run]

Options:
  -g, -ResourceGroup, --resource-group <name>  Resource group to delete (default: rg-srelabcosmos)
    -w, -Workload, --workload <name>             Workload used to derive rg-<workload>
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
        '-w' { if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }; $Workload = $args[$index] }
        '-Workload' { if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }; $Workload = $args[$index] }
        '--workload' { if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }; $Workload = $args[$index] }
        '-y' { $Yes = $true }
        '-Yes' { $Yes = $true }
        '--yes' { $Yes = $true }
        '--dry-run' { $DryRun = $true }
        '-h' { Show-Usage; exit 0 }
        '-Help' { Show-Usage; exit 0 }
        '--help' { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

if (-not $ResourceGroupSet) { $ResourceGroup = "rg-$Workload" }

Write-Host "========================================"
Write-Host "  SRE Agent Workshop — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"
Write-Host ""

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

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
