#!/usr/bin/env pwsh
# Proves the Azure Boards Copilot Handover incident has been fully recovered:
# the deployed commit matches local HEAD, the incident batch is completed,
# receipts split exactly 3 v1 / 20 v2 (23 total), the Service Bus queue has
# zero active and zero dead-lettered messages, and no
# UnsupportedReceiptSchemaError exceptions occurred after the deployment
# timestamp. Query failures fail validation; nothing here repairs the app.

param()

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '../../..')).Path

$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$FunctionApp = ''

function Show-Usage {
    @"
Usage: .\validate.ps1 [--workload <name>] [--resource-group <name>] [--app-name <name>] [--subscription-id <id>] [--help]

Proves the incident is fully recovered: deployed SHA matches local HEAD, the
incident is completed, receipts split exactly 3 v1 / 20 v2, the Service Bus
queue is empty (zero active, zero dead-lettered), and no
UnsupportedReceiptSchemaError exceptions occurred after deployment.

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
Write-Host "  Azure Boards Copilot Handover — Validate"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

foreach ($requiredCommand in @('az', 'curl', 'jq', 'git')) {
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

Push-Location $RepoRoot
try {
    $localHeadSha = (git rev-parse HEAD).Trim()
}
finally {
    Pop-Location
}

$functionHostname = [string](az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv).Trim()
$functionKey = [string](az functionapp keys list --resource-group $ResourceGroup --name $FunctionApp --query "functionKeys.default" --output tsv).Trim()

$statusFile = New-TemporaryFile
try {
    curl -sS -o $statusFile.FullName -w '%{http_code}' "https://$functionHostname/api/status?code=$functionKey" | Out-Null

    $deployedCommitSha = [string](jq -er '.deployedCommitSha // empty' $statusFile.FullName).Trim()
    $deployedAtUtc = [string](jq -er '.deployedAtUtc // empty' $statusFile.FullName).Trim()
    $incidentBatchInjected = [string](jq -er '.incidentBatchInjected' $statusFile.FullName).Trim()
    $normalizedReceiptCount = [string](jq -er '.normalizedReceiptCount' $statusFile.FullName).Trim()
    $v1ReceiptCount = [string](jq -er '.v1ReceiptCount' $statusFile.FullName).Trim()
    $v2ReceiptCount = [string](jq -er '.v2ReceiptCount' $statusFile.FullName).Trim()

    Write-Host ""
    Write-Host "Deployed commit SHA: $deployedCommitSha"
    Write-Host "Local HEAD SHA:      $localHeadSha"

    $failures = 0

    if ($deployedCommitSha -ne $localHeadSha) {
        Write-Error "FAIL: deployed sha '$deployedCommitSha' does not match local HEAD sha '$localHeadSha'."
        $failures++
    }

    if ($incidentBatchInjected -ne 'true') {
        Write-Error "FAIL: the incident batch has not completed (incidentBatchInjected=$incidentBatchInjected)."
        $failures++
    }

    if ($normalizedReceiptCount -ne '23' -or $v1ReceiptCount -ne '3' -or $v2ReceiptCount -ne '20') {
        Write-Error "FAIL: receipt split is not exactly 3 v1 / 20 v2 (23 total); got v1=$v1ReceiptCount v2=$v2ReceiptCount total=$normalizedReceiptCount."
        $failures++
    }

    if ($failures -ne 0) {
        throw "Validation failed ($failures issue(s)) before querying Azure telemetry."
    }

    Write-Host "Receipts: $normalizedReceiptCount total ($v1ReceiptCount v1 / $v2ReceiptCount v2)"

    Write-Host "Querying the Service Bus queue for backlog and dead-letter counts..."
    $serviceBusNamespace = [string](az servicebus namespace list --resource-group $ResourceGroup --query "[0].name" --output tsv).Trim()
    $queueJson = az servicebus queue show `
        --resource-group $ResourceGroup `
        --namespace-name $serviceBusNamespace `
        --name order-events `
        --query "{active:countDetails.activeMessageCount, dlq:countDetails.deadLetterMessageCount}" `
        --output json
    if ($LASTEXITCODE -ne 0) { throw "Service Bus queue query failed." }
    $queueActive = [string]($queueJson | jq -er '.active').Trim()
    $queueDlq = [string]($queueJson | jq -er '.dlq').Trim()
    Write-Host "Service Bus queue: active=$queueActive dlq=$queueDlq"

    if ($queueActive -ne '0') {
        Write-Error "FAIL: Service Bus queue has $queueActive active message(s); expected zero."
        $failures++
    }

    if ($queueDlq -ne '0') {
        Write-Error "FAIL: Service Bus queue has $queueDlq dead-letter (DLQ) message(s); expected zero."
        $failures++
    }

    Write-Host "Querying Application Insights for UnsupportedReceiptSchemaError exceptions since deployment..."
    $appInsightsName = [string](az resource list --resource-group $ResourceGroup --resource-type "Microsoft.Insights/components" --query "[0].name" --output tsv).Trim()
    $exceptionQuery = "exceptions | where type == 'UnsupportedReceiptSchemaError' | where timestamp > datetime($deployedAtUtc) | summarize count()"
    $exceptionsJson = az monitor app-insights query `
        --app $appInsightsName `
        --resource-group $ResourceGroup `
        --analytics-query $exceptionQuery `
        --output json
    if ($LASTEXITCODE -ne 0) { throw "Application Insights query failed." }
    $exceptionCount = [string]($exceptionsJson | jq -er '.tables[0].rows[0][0]').Trim()
    Write-Host "UnsupportedReceiptSchemaError exceptions since deployment: $exceptionCount"

    if ($exceptionCount -ne '0') {
        Write-Error "FAIL: $exceptionCount UnsupportedReceiptSchemaError exception(s) occurred after DEPLOYED_AT_UTC ($deployedAtUtc)."
        $failures++
    }

    if ($failures -ne 0) {
        throw "Validation failed ($failures issue(s))."
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Validation passed: incident fully recovered"
    Write-Host "========================================"
}
finally {
    Remove-Item -Force $statusFile.FullName -ErrorAction SilentlyContinue
}
