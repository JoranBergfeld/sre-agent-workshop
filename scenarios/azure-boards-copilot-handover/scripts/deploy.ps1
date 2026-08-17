#!/usr/bin/env pwsh
# Deploys the current checkout of the Azure Boards Copilot Handover Function
# app to an already-provisioned scenario resource group. Runs the app's
# baseline quality gates first, ships a clean runtime-only zip (no venv, no
# tests), stamps the exact deployed git commit and UTC timestamp as Function
# app settings, and waits (bounded) for the keyed status endpoint to confirm
# the new commit is live.

param()

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '../../..')).Path
$AppDir = Join-Path $RepoRoot 'scenarios/azure-boards-copilot-handover/app'

$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$FunctionApp = ''
$KeepTemp = $false

$StatusPollAttempts = if ($env:STATUS_POLL_ATTEMPTS) { [int]$env:STATUS_POLL_ATTEMPTS } else { 20 }
$StatusPollDelaySeconds = if ($env:STATUS_POLL_DELAY_SECONDS) { [int]$env:STATUS_POLL_DELAY_SECONDS } else { 10 }

function Show-Usage {
    @"
Usage: .\deploy.ps1 [--workload <name>] [--resource-group <name>] [--app-name <name>] [--subscription-id <id>] [--keep-temp] [--help]

Deploys the current checkout to an already-provisioned Function app.

Options:
  -w, -Workload, --workload             Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group containing the Function app (default: <workload>-rg)
  -a, -AppName, --app-name              Function app name (default: discovered via az functionapp list)
  -s, -SubscriptionId, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      --keep-temp                      Keep the staged zip/temp directory instead of deleting it (debugging)
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
        '--keep-temp' { $KeepTemp = $true }
        { $_ -in '-h', '-Help', '--help' } { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

if (-not $ResourceGroupSet) { $ResourceGroup = "$Workload-rg" }

Write-Host "========================================"
Write-Host "  Azure Boards Copilot Handover — Deploy"
Write-Host "========================================"
Write-Host "Resource group: $ResourceGroup"

foreach ($requiredCommand in @('az', 'git', 'curl', 'jq')) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $requiredCommand"
    }
}
if (-not (Get-Command Compress-Archive -ErrorAction SilentlyContinue)) {
    throw "Required command not found: Compress-Archive"
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

# --- Baseline quality gates (run against the current checkout) ------------
$venvBin = Join-Path $AppDir '.venv/bin'
if (Test-Path $venvBin) {
    $env:PATH = "$venvBin$([System.IO.Path]::PathSeparator)$($env:PATH)"
}

foreach ($requiredTool in @('ruff', 'mypy', 'pytest')) {
    if (-not (Get-Command $requiredTool -ErrorAction SilentlyContinue)) {
        throw "Required Python tool not found: $requiredTool (expected in $AppDir/.venv or on PATH)"
    }
}

Write-Host "Running baseline quality gates from $AppDir ..."
Push-Location $AppDir
try {
    ruff format --check .; if ($LASTEXITCODE -ne 0) { throw "ruff format --check failed." }
    ruff check .; if ($LASTEXITCODE -ne 0) { throw "ruff check failed." }
    mypy; if ($LASTEXITCODE -ne 0) { throw "mypy failed." }
    pytest; if ($LASTEXITCODE -ne 0) { throw "pytest failed." }
}
finally {
    Pop-Location
}

# --- Stage a clean runtime-only zip (no venv, no tests, no caches) ---------
$WorkDir = New-Item -ItemType Directory -Path (Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName()))
$StageDir = New-Item -ItemType Directory -Path (Join-Path $WorkDir.FullName 'stage')

try {
    Copy-Item (Join-Path $AppDir 'function_app.py') $StageDir.FullName
    Copy-Item (Join-Path $AppDir 'host.json') $StageDir.FullName
    Copy-Item (Join-Path $AppDir 'requirements.txt') $StageDir.FullName

    Push-Location $AppDir
    try {
        $trackedFiles = (git ls-files -- order_events) -split "`n" | Where-Object { $_ -ne '' }
    }
    finally {
        Pop-Location
    }
    foreach ($relativePath in $trackedFiles) {
        $destination = Join-Path $StageDir.FullName $relativePath
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        Copy-Item (Join-Path $AppDir $relativePath) $destination
    }

    $zipPath = Join-Path $WorkDir.FullName 'app.zip'
    Compress-Archive -Path (Join-Path $StageDir.FullName '*') -DestinationPath $zipPath

    if ($KeepTemp -and $env:DEPLOY_KEEP_TEMP_DIR_LOG) {
        Set-Content -Path $env:DEPLOY_KEEP_TEMP_DIR_LOG -Value $WorkDir.FullName
    }

    # --- Ensure remote build is enabled (idempotent) ---------------------------
    $currentBuildSetting = [string](az functionapp config appsettings list --resource-group $ResourceGroup --name $FunctionApp --query "[?name=='SCM_DO_BUILD_DURING_DEPLOYMENT'].value | [0]" --output tsv)
    if ($currentBuildSetting.Trim() -ne 'true') {
        Write-Host "Enabling remote build (SCM_DO_BUILD_DURING_DEPLOYMENT)..."
        az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings 'SCM_DO_BUILD_DURING_DEPLOYMENT=true' --output none
        if ($LASTEXITCODE -ne 0) { throw "Failed to enable remote build." }
    }

    # --- Stamp the exact deployed commit and UTC timestamp ---------------------
    Push-Location $RepoRoot
    try {
        $deployedCommitSha = (git rev-parse HEAD).Trim()
    }
    finally {
        Pop-Location
    }
    $deployedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-Host "Stamping DEPLOYED_COMMIT_SHA=$deployedCommitSha DEPLOYED_AT_UTC=$deployedAtUtc"
    az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings "DEPLOYED_COMMIT_SHA=$deployedCommitSha" "DEPLOYED_AT_UTC=$deployedAtUtc" --output none
    if ($LASTEXITCODE -ne 0) { throw "Failed to stamp deployment provenance settings." }

    # --- Deploy the zip ---------------------------------------------------------
    Write-Host "Deploying zip package to Function app '$FunctionApp' ..."
    az functionapp deploy --resource-group $ResourceGroup --name $FunctionApp --src-path $zipPath --type zip --output none
    if ($LASTEXITCODE -ne 0) { throw "Function zip deploy failed." }

    # --- Wait (bounded) for the keyed status endpoint to report the new SHA ----
    $functionHostname = [string](az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv).Trim()
    $functionKey = [string](az functionapp keys list --resource-group $ResourceGroup --name $FunctionApp --query "functionKeys.default" --output tsv).Trim()
    $statusUrl = "https://$functionHostname/api/status?code=$functionKey"

    Write-Host "Waiting for deployment to report DEPLOYED_COMMIT_SHA=$deployedCommitSha ..."
    $deployedShaConfirmed = $false
    for ($attempt = 1; $attempt -le $StatusPollAttempts; $attempt++) {
        $statusBodyFile = Join-Path $WorkDir.FullName "status-$attempt.json"
        curl -sS -o $statusBodyFile -w '%{http_code}' $statusUrl 2>$null | Out-Null
        $reportedSha = $null
        if (Test-Path $statusBodyFile) {
            $reportedSha = [string](jq -er '.deployedCommitSha // empty' $statusBodyFile 2>$null)
        }
        if ($reportedSha -eq $deployedCommitSha) {
            $deployedShaConfirmed = $true
            break
        }
        if ($attempt -lt $StatusPollAttempts) {
            Start-Sleep -Seconds $StatusPollDelaySeconds
        }
    }

    if (-not $deployedShaConfirmed) {
        throw "Timed out after $StatusPollAttempts attempts: status endpoint did not report DEPLOYED_COMMIT_SHA=$deployedCommitSha."
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Deploy complete: $deployedCommitSha"
    Write-Host "========================================"
}
finally {
    if (-not $KeepTemp) {
        Remove-Item -Recurse -Force $WorkDir.FullName -ErrorAction SilentlyContinue
    }
}
