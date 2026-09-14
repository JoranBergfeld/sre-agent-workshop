#!/usr/bin/env pwsh
# Injects the v2 incident batch by calling the keyed submit-v2-orders
# endpoint. A fresh submission returns 202 (accepted); a repeat submission
# against an already-completed incident returns 200 (idempotent, recoverable).
# Both are success. Any other response fails loudly.

param()

$ErrorActionPreference = 'Stop'

$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$FunctionApp = ''

function Show-Usage {
    @"
Usage: .\inject.ps1 [--workload <name>] [--resource-group <name>] [--app-name <name>] [--subscription-id <id>] [--help]

Submits the v2 incident order batch to the deployed Function app.

Options:
  -w, -Workload, --workload             Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group containing the Function app (default: <workload>-rg)
  -a, -AppName, --app-name              Function app name (default: discovered via az functionapp list)
  -s, -SubscriptionId, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
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
        { $_ -in '-a', '-AppName', '--app-name' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $FunctionApp = $args[$index]
        }
        { $_ -in '-s', '-SubscriptionId', '--subscription-id' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $env:AZURE_SUBSCRIPTION_ID = $args[$index]
        }
        { $_ -in '-h', '-Help', '--help' } { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

if (-not $ResourceGroupSet) { $ResourceGroup = "$Workload-rg" }

Write-Host "========================================"
Write-Host "  Azure Boards Copilot Handover — Inject"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

foreach ($requiredCommand in @('az', 'curl', 'jq')) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $requiredCommand"
    }
}

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

if ([string]::IsNullOrWhiteSpace($FunctionApp)) {
    $FunctionApp = [string](az functionapp list --resource-group $ResourceGroup --query "[0].name" --output tsv)
    if ([string]::IsNullOrWhiteSpace($FunctionApp)) {
        throw "Unable to discover a Function app in resource group '$ResourceGroup'. Pass --app-name explicitly."
    }
}
Write-Host "Function app: $FunctionApp"

$functionHostname = [string](az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv).Trim()
$functionKey = [string](az functionapp keys list --resource-group $ResourceGroup --name $FunctionApp --query "functionKeys.default" --output tsv).Trim()

$responseFile = New-TemporaryFile
$statusFile = New-TemporaryFile
try {
    Write-Host "Submitting the v2 incident order batch..."
    $submitHttpCode = curl -sS -o $responseFile.FullName -w '%{http_code}' -X POST "https://$functionHostname/api/submit-v2-orders?code=$functionKey"
    $submitBody = Get-Content $responseFile.FullName -Raw

    if ($submitHttpCode -ne '202' -and $submitHttpCode -ne '200') {
        throw "Unexpected submit-v2-orders response: HTTP $submitHttpCode`: $submitBody"
    }
    Write-Host "Submit response (HTTP $submitHttpCode): $submitBody"

    curl -sS -o $statusFile.FullName -w '%{http_code}' "https://$functionHostname/api/status?code=$functionKey" | Out-Null

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Current workshop status"
    Write-Host "========================================"
    Get-Content $statusFile.FullName -Raw | Write-Host
}
finally {
    Remove-Item -Force $responseFile.FullName, $statusFile.FullName -ErrorAction SilentlyContinue
}
