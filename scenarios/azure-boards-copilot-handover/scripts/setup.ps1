#!/usr/bin/env pwsh
# Provisions the Azure Boards Copilot Handover scenario end-to-end: creates the
# subscription-scope infrastructure, deploys the current (intentionally
# flawed, v1-only) checkout, seeds the deterministic v1 control events, and
# prints the keyed workshop URLs a learner needs next.

param()

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '../../..')).Path
$ScenarioDir = Join-Path $RepoRoot 'scenarios/azure-boards-copilot-handover'

$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$Location = 'eastus2'

$RetryAttempts = if ($env:RETRY_ATTEMPTS) { [int]$env:RETRY_ATTEMPTS } else { 10 }
$RetryDelaySeconds = if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 15 }

function Show-Usage {
    @"
Usage: .\setup.ps1 [--workload <name>] [--resource-group <name>] [--location <region>] [--subscription-id <id>] [--help]

Provisions the Azure Boards Copilot Handover scenario: infrastructure,
starting application, and the deterministic v1 control-event seed.

Options:
  -w, -Workload, --workload             Workload name: 6-24 lowercase letters/numbers/hyphens (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group name (default: <workload>-rg)
  -l, -Location, --location             Azure region (default: eastus2)
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
        { $_ -in '-l', '-Location', '--location' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $Location = $args[$index]
        }
        { $_ -in '-s', '-SubscriptionId', '--subscription-id' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $env:AZURE_SUBSCRIPTION_ID = $args[$index]
        }
        { $_ -in '-h', '-Help', '--help' } { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

Write-Host "========================================"
Write-Host "  Azure Boards Copilot Handover — Setup"
Write-Host "========================================"
Write-Host "Workload: $Workload"
Write-Host "Location: $Location"

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

Write-Host "Provisioning subscription-scope infrastructure (infra/bicep/main.bicep)..."
$deploymentOutputs = az deployment sub create `
    --location $Location `
    --template-file (Join-Path $ScenarioDir 'infra/bicep/main.bicep') `
    --parameters "location=$Location" "workloadName=$Workload" `
    --query properties.outputs `
    --output json
if ($LASTEXITCODE -ne 0) { throw "Subscription-scope infrastructure deployment failed." }

$discoveredResourceGroup = [string]($deploymentOutputs | jq -er '.resourceGroupName.value').Trim()
$functionApp = [string]($deploymentOutputs | jq -er '.functionAppName.value').Trim()
$functionHostname = [string]($deploymentOutputs | jq -er '.functionAppHostName.value').Trim()

if ($ResourceGroupSet -and $ResourceGroup -ne $discoveredResourceGroup) {
    Write-Warning "Requested resource group '$ResourceGroup' differs from the provisioned resource group '$discoveredResourceGroup'; using the provisioned one."
}
$ResourceGroup = $discoveredResourceGroup

Write-Host "Resource group: $ResourceGroup"
Write-Host "Function app:   $functionApp"

Write-Host "Deploying the current (starting) checkout (bounded retry for Function startup/RBAC propagation)..."
$deploySucceeded = $false
for ($attempt = 1; $attempt -le $RetryAttempts; $attempt++) {
    & (Join-Path $ScriptDir 'deploy.ps1') -ResourceGroup $ResourceGroup -AppName $functionApp
    if ($LASTEXITCODE -eq 0) {
        $deploySucceeded = $true
        break
    }
    if ($attempt -lt $RetryAttempts) {
        Write-Warning "Deploy attempt $attempt failed; retrying in ${RetryDelaySeconds}s..."
        Start-Sleep -Seconds $RetryDelaySeconds
    }
}

if (-not $deploySucceeded) {
    throw "Failed after $RetryAttempts attempts: deploying the starting application (startup/RBAC propagation may still be in progress)."
}

Write-Host "Retrieving the Function host key (bounded retry for startup/RBAC propagation)..."
$functionKey = ''
for ($attempt = 1; $attempt -le $RetryAttempts; $attempt++) {
    $candidateKey = [string](az functionapp keys list --resource-group $ResourceGroup --name $functionApp --query "functionKeys.default" --output tsv 2>$null)
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($candidateKey)) {
        $functionKey = $candidateKey.Trim()
        break
    }
    if ($attempt -lt $RetryAttempts) {
        Start-Sleep -Seconds $RetryDelaySeconds
    }
}

if ([string]::IsNullOrWhiteSpace($functionKey)) {
    throw "Failed after $RetryAttempts attempts: unable to retrieve the Function host key (startup/RBAC propagation may still be in progress)."
}

Write-Host "Seeding the deterministic v1 control events (idempotent)..."
$seedResponseFile = New-TemporaryFile
try {
    $seedHttpCode = curl -sS -o $seedResponseFile.FullName -w '%{http_code}' -X POST "https://$functionHostname/api/seed-v1-controls?code=$functionKey"
    $seedBody = Get-Content $seedResponseFile.FullName -Raw
    if ($seedHttpCode -ne '200' -and $seedHttpCode -ne '202') {
        throw "Seeding v1 control events failed with HTTP $seedHttpCode`: $seedBody"
    }
    Write-Host "Seed response: $seedBody"
}
finally {
    Remove-Item -Force $seedResponseFile.FullName -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "========================================"
Write-Host "  Setup complete"
Write-Host "========================================"
Write-Host "Status URL:            https://$functionHostname/api/status?code=<FUNCTION_KEY>"
Write-Host "Submit v2 orders URL:  https://$functionHostname/api/submit-v2-orders?code=<FUNCTION_KEY>"
Write-Host ""
Write-Host "Retrieve the actual key with:"
Write-Host "  az functionapp keys list --resource-group $ResourceGroup --name $functionApp --query functionKeys.default --output tsv"
