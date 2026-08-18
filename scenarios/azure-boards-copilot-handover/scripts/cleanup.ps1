#!/usr/bin/env pwsh
# Tears down the Azure Boards Copilot Handover scenario resource group. Never
# touches GitHub or Azure Boards state: the scenario's Copilot handover work
# item/issue lifecycle is entirely out of scope for this script.

param()

$ErrorActionPreference = 'Stop'
$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$Yes = $false
$DryRun = $false

function Show-Usage {
    @"
Usage: .\cleanup.ps1 [--workload <name>] [--resource-group <name>] [--subscription-id <id>] [--yes] [--dry-run]

Deletes the Azure Boards Copilot Handover scenario resource group. Does not
touch GitHub or Azure Boards.

Options:
  -w, -Workload, --workload             Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group to delete (default: <workload>-rg)
  -s, -SubscriptionId, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
  -y, -Yes, --yes                       Skip the confirmation prompt
      --dry-run                        Show the selected resource group without deleting it
  -h, -Help, --help                    Show this help
"@ | Write-Host
}

for ($index = 0; $index -lt $args.Count; $index++) {
    $argument = $args[$index]
    switch ($argument) {
        { $_ -in '-w', '-Workload', '--workload' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $Workload = $args[$index]
        }
        { $_ -in '-g', '-ResourceGroup', '--resource-group' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ResourceGroup = $args[$index]
            $ResourceGroupSet = $true
        }
        { $_ -in '-s', '-SubscriptionId', '--subscription-id' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $env:AZURE_SUBSCRIPTION_ID = $args[$index]
        }
        { $_ -in '-y', '-Yes', '--yes' } { $Yes = $true }
        '--dry-run' { $DryRun = $true }
        { $_ -in '-h', '-Help', '--help' } { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

if (-not $ResourceGroupSet) { $ResourceGroup = "$Workload-rg" }

Write-Host "========================================"
Write-Host "  Azure Boards Copilot Handover — Cleanup"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"
Write-Host ""

if ($DryRun) {
    Write-Host "Dry run: would delete resource group '$ResourceGroup'."
    exit 0
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Required command not found: az"
}

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

$rg = az group show --name $ResourceGroup 2>$null
if (-not $rg) {
    Write-Host "Resource group '$ResourceGroup' not found. Nothing to delete."
    exit 0
}

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
