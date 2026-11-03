#!/usr/bin/env pwsh
# Deploys an exact-source Actions package through a private blob URL by default.
# --build-mode source retains the quality-gated Oryx source deployment alternative.
# Both routes preserve the SHA readiness and post-cutover coherence checks.

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
$BuildMode = 'artifact'
$ArtifactRepo = ''

# Linux Consumption (Y1) remote builds (Oryx installing azure-identity,
# azure-servicebus, azure-data-tables, etc.) can take several minutes,
# especially on a cold plan right after provisioning; 90 attempts * 10s
# gives a 15-minute bound instead of cutting off a build still in progress.
$StatusPollAttempts = if ($env:STATUS_POLL_ATTEMPTS) { [int]$env:STATUS_POLL_ATTEMPTS } else { 90 }
$StatusPollDelaySeconds = if ($env:STATUS_POLL_DELAY_SECONDS) { [int]$env:STATUS_POLL_DELAY_SECONDS } else { 10 }

function Show-Usage {
    @"
Usage: .\deploy.ps1 [--workload <name>] [--resource-group <name>] [--app-name <name>] [--subscription-id <id>] [--build-mode artifact|source] [--repo owner/name] [--keep-temp] [--help]

Deploys the current checkout to an already-provisioned Function app.

Options:
  -w, -Workload, --workload             Workload name used to derive <workload>-rg (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group containing the Function app (default: <workload>-rg)
  -a, -AppName, --app-name              Function app name (default: discovered via az functionapp list)
  -s, -SubscriptionId, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      -BuildMode, --build-mode          artifact (default): exact-HEAD Actions package; source: local gates + remote Oryx build
      -Repo, --repo                    Explicit artifact repository owner/name (default: Git origin)
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
        { $_ -in '-BuildMode', '--build-mode' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $BuildMode = $args[$index]
        }
        { $_ -in '-Repo', '--repo' } {
            if (++$index -ge $args.Count -or $args[$index] -like '-*') { throw "Missing value for $argument." }
            $ArtifactRepo = $args[$index]
        }
        { $_ -in '-h', '-Help', '--help' } { Show-Usage; exit 0 }
        default { throw "Unknown option: $argument" }
    }
}

if ($BuildMode -cnotin @('artifact', 'source')) { throw '--build-mode must be artifact or source.' }
if ($BuildMode -eq 'source' -and $ArtifactRepo) { throw '--repo applies only to artifact mode.' }
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
if ($BuildMode -eq 'source' -and -not (Get-Command Compress-Archive -ErrorAction SilentlyContinue)) {
    throw "Required command not found: Compress-Archive"
}

$WorkDir = New-Item -ItemType Directory -Path (Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName()))
try {
    if ($KeepTemp -and $env:DEPLOY_KEEP_TEMP_DIR_LOG) {
        Set-Content -Path $env:DEPLOY_KEEP_TEMP_DIR_LOG -Value $WorkDir.FullName
    }
    if ($BuildMode -eq 'artifact') {
        foreach ($requiredCommand in @('node', 'gh')) {
            if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) { throw "Required artifact command not found: $requiredCommand (Node.js 20+ and authenticated gh required)." }
        }
        $resolverArgs = @((Join-Path $RepoRoot 'scripts/build-artifacts/resolve.mjs'), '--scenario', 'azure-boards-copilot-handover', '--variant', 'application', '--output-dir', (Join-Path $WorkDir.FullName 'artifacts'))
        if ($ArtifactRepo) { $resolverArgs += @('--repo', $ArtifactRepo) }
        $resolvedJson = node @resolverArgs
        if ($LASTEXITCODE -ne 0) { throw 'Exact-source artifact resolution failed. No deployment was attempted.' }
        $resolved = $resolvedJson | ConvertFrom-Json
        $zipPath = [string]$resolved.deploymentZip
        $deployedCommitSha = [string]$resolved.sourceSha
        if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf) -or $deployedCommitSha -cnotmatch '^[0-9a-f]{40}$') { throw 'Invalid artifact resolver output.' }
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
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($FunctionApp)) {
            throw "Unable to discover a Function app in resource group '$ResourceGroup'. Pass --app-name explicitly."
        }
    }
    Write-Host "Function app: $FunctionApp"

    # --- Baseline quality gates (run against the current checkout) ------------
    if ($BuildMode -eq 'source') {
        # Windows venvs place scripts under Scripts/, not bin/ (the POSIX layout
        # deploy.sh looks for); check both so auto-discovery works cross-platform
        # even when the caller hasn't pre-activated the venv.
        foreach ($venvBinDir in @('.venv/Scripts', '.venv/bin')) {
            $venvBin = Join-Path $AppDir $venvBinDir
            if (Test-Path $venvBin) {
                $env:PATH = "$venvBin$([System.IO.Path]::PathSeparator)$($env:PATH)"
                break
            }
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

        Push-Location $RepoRoot
        try {
            $trackedChanges = git status --porcelain --untracked-files=all -- scenarios/azure-boards-copilot-handover/app
            if ($LASTEXITCODE -ne 0) { throw "Unable to inspect the checkout status." }
        }
        finally {
            Pop-Location
        }
        if ($trackedChanges) {
            throw 'Refusing to deploy from a checkout with tracked or untracked application changes. Commit or discard the changes and try again.'
        }

        # --- Stage a clean runtime-only zip (no venv, no tests, no caches) ---------
        $StageDir = New-Item -ItemType Directory -Path (Join-Path $WorkDir.FullName 'stage')
        Push-Location $RepoRoot
        try {
            $deployedCommitSha = (git rev-parse HEAD).Trim()
            if ($LASTEXITCODE -ne 0 -or $deployedCommitSha -cnotmatch '^[0-9a-f]{40}$') { throw 'Unable to read current Git commit.' }
        } finally { Pop-Location }
        @{ sourceSha = $deployedCommitSha } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $StageDir.FullName 'build-revision.json') -Encoding utf8NoBOM

        Copy-Item (Join-Path $AppDir 'function_app.py') $StageDir.FullName
        Copy-Item (Join-Path $AppDir 'host.json') $StageDir.FullName
        Copy-Item (Join-Path $AppDir 'requirements.txt') $StageDir.FullName

        Push-Location $AppDir
        try {
            $trackedFiles = (git ls-files -- order_events) -split "`n" | Where-Object { $_ -ne '' }
            if ($LASTEXITCODE -ne 0) { throw 'Unable to list tracked application files.' }
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

        az functionapp config appsettings delete --resource-group $ResourceGroup --name $FunctionApp --setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID --output none
        if ($LASTEXITCODE -ne 0) { throw 'Failed to remove artifact package settings before source build.' }
        az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings 'SCM_DO_BUILD_DURING_DEPLOYMENT=true' 'ENABLE_ORYX_BUILD=true' --output none
        if ($LASTEXITCODE -ne 0) { throw 'Failed to enable remote Oryx build.' }

    } else {
        $packageStorage = [string](az functionapp config appsettings list --resource-group $ResourceGroup --name $FunctionApp --query "[?name=='WORKSHOP_PACKAGE_STORAGE_ACCOUNT'].value | [0]" --output tsv)
        if ($LASTEXITCODE -ne 0) { throw 'Unable to read package storage setting.' }
        $packageContainer = [string](az functionapp config appsettings list --resource-group $ResourceGroup --name $FunctionApp --query "[?name=='WORKSHOP_PACKAGE_CONTAINER'].value | [0]" --output tsv)
        if ($LASTEXITCODE -ne 0) { throw 'Unable to read package container setting.' }
        if ($packageStorage -cnotmatch '^[a-z0-9]{3,24}$' -or $packageContainer -cne 'application-packages') { throw 'Missing package storage settings. Re-provision the updated scenario infrastructure.' }
        $blobEndpoint = [string](az storage account show --resource-group $ResourceGroup --name $packageStorage --query primaryEndpoints.blob --output tsv)
        if ($LASTEXITCODE -ne 0 -or $blobEndpoint -cnotmatch '^https://[a-z0-9.-]+/$') { throw 'Invalid package blob endpoint.' }
        $metadata = Get-Content -LiteralPath (Join-Path (Split-Path $zipPath) 'metadata.json') -Raw | ConvertFrom-Json
        $packageHash = [string]$metadata.files[0].sha256
        if ($packageHash -cnotmatch '^[0-9a-f]{64}$') { throw 'Missing package checksum.' }
        $blobName = "$deployedCommitSha/$packageHash.zip"
        $blobExists = [string](az storage blob exists --account-name $packageStorage --container-name $packageContainer --name $blobName --auth-mode login --query exists --output tsv)
        if ($LASTEXITCODE -ne 0) { throw 'Unable to determine package blob existence.' }
        if ($blobExists -ceq 'true') {
            $existing = Join-Path $WorkDir.FullName 'existing.zip'
            az storage blob download --account-name $packageStorage --container-name $packageContainer --name $blobName --file $existing --auth-mode login --only-show-errors --output none
            if ($LASTEXITCODE -ne 0) { throw 'Unable to verify existing package blob.' }
            if ((Get-FileHash -LiteralPath $existing -Algorithm SHA256).Hash.ToLowerInvariant() -cne $packageHash) { throw 'Existing package blob checksum conflict.' }
        } elseif ($blobExists -ceq 'false') {
            az storage blob upload --account-name $packageStorage --container-name $packageContainer --name $blobName --file $zipPath --auth-mode login --overwrite false --only-show-errors --output none
            if ($LASTEXITCODE -ne 0) { throw 'Package upload failed. Verify Storage Blob Data Contributor access to the private package container.' }
        } else { throw 'Unable to determine package blob existence.' }
        $packageUrl = "$blobEndpoint$packageContainer/$blobName"
        az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings "WEBSITE_RUN_FROM_PACKAGE=$packageUrl" 'WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID=SystemAssigned' 'SCM_DO_BUILD_DURING_DEPLOYMENT=false' 'ENABLE_ORYX_BUILD=false' --output none
        if ($LASTEXITCODE -ne 0) { throw 'Failed to configure managed-identity external package.' }
    }

    # Keep the mutable setting separate from package-proven worker readiness.
    Write-Host "Stamping DEPLOYED_COMMIT_SHA=$deployedCommitSha"
    az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings "DEPLOYED_COMMIT_SHA=$deployedCommitSha" --output none
    if ($LASTEXITCODE -ne 0) { throw "Failed to stamp DEPLOYED_COMMIT_SHA." }

    # --- Deploy the zip ---------------------------------------------------------
    # Uses the long-stable `deployment source config-zip` API rather than
    # `functionapp deploy --type zip`: the latter's OneDeploy API has been
    # known to intermittently fail with "This API isn't available in this
    # environment yet!" (see Azure/azure-cli#33014), which config-zip does
    # not hit.
    #
    # --build-remote true is required, not just the SCM_DO_BUILD_DURING_DEPLOYMENT
    # app setting above: on a freshly-provisioned app, that setting write and
    # this deploy race — the Kudu build engine can still be starting up on the
    # old (false) value when the zip lands, silently skipping the Oryx
    # dependency build and shipping a package with no installed packages
    # (import errors for every third-party dependency, e.g.
    # ModuleNotFoundError: No module named 'azure.data'). Passing
    # --build-remote true forces the build for this deploy regardless of that
    # race.
    if ($BuildMode -eq 'source') {
        Write-Host "Deploying source zip package to Function app '$FunctionApp' ..."
        az functionapp deployment source config-zip --resource-group $ResourceGroup --name $FunctionApp --src $zipPath --build-remote true --output none
        if ($LASTEXITCODE -ne 0) { throw "Function zip deploy failed." }
    }

    # On Linux Consumption, the Python worker can keep serving the previous
    # package after a config-zip deploy until the app is explicitly
    # restarted; without this, the go-live poll below can time out even
    # though the new package deployed successfully.
    Write-Host "Restarting Function app to ensure the new package is loaded..."
    az functionapp restart --resource-group $ResourceGroup --name $FunctionApp --output none
    if ($LASTEXITCODE -ne 0) { throw "Failed to restart the Function app after deploy." }

    if ($BuildMode -eq 'artifact') {
        $functionId = [string](az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query id --output tsv)
        if ($LASTEXITCODE -ne 0 -or $functionId -notlike '/subscriptions/*/resourceGroups/*/providers/Microsoft.Web/sites/*') { throw 'Invalid Function app resource ID.' }
        $synced = $false
        for ($attempt = 1; $attempt -le $StatusPollAttempts; $attempt++) {
            az rest --method post --uri "https://management.azure.com$functionId/syncfunctiontriggers?api-version=2023-12-01" --output none
            if ($LASTEXITCODE -eq 0) { $synced = $true; break }
            if ($attempt -lt $StatusPollAttempts) { Start-Sleep -Seconds $StatusPollDelaySeconds }
        }
        if (-not $synced) { throw 'Function trigger synchronization failed; verify package MI access and retry.' }
    }
    $functionHostname = [string](az functionapp show --resource-group $ResourceGroup --name $FunctionApp --query defaultHostName --output tsv)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($functionHostname)) { throw 'Unable to retrieve Function hostname.' }
    $functionKey = [string](az functionapp keys list --resource-group $ResourceGroup --name $FunctionApp --query "functionKeys.default" --output tsv)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($functionKey)) { throw 'Unable to retrieve Function status key.' }
    $statusUrl = "https://$functionHostname/api/status"

    # Polls (bounded by StatusPollAttempts/StatusPollDelaySeconds) the keyed
    # status endpoint until it reports deployedCommitSha, or throws loudly on
    # timeout. Reused for both the initial go-live check and the post-cutover
    # coherence recheck below so neither poll is unbounded or circular.
    function Wait-ForDeployedSha {
        param(
            [Parameter(Mandatory = $true)][string]$PhaseLabel
        )

        $confirmed = $false
        $lastHttpCode = ''
        $lastBody = ''
        for ($attempt = 1; $attempt -le $StatusPollAttempts; $attempt++) {
            $statusBodyFile = Join-Path $WorkDir.FullName "status-$PhaseLabel-$attempt.json"
            $lastHttpCode = (curl -sS --connect-timeout 10 --max-time 30 -H "x-functions-key: $functionKey" -o $statusBodyFile -w '%{http_code}' $statusUrl 2>&1 | Out-String).Trim()
            if ([string]::IsNullOrWhiteSpace($lastHttpCode)) { $lastHttpCode = '(no response / request failed)' }
            $reportedSha = $null
            $packageSha = $null
            if (Test-Path $statusBodyFile) {
                $lastBody = Get-Content $statusBodyFile -Raw -ErrorAction SilentlyContinue
                $reportedSha = [string](jq -er '.deployedCommitSha // empty' $statusBodyFile 2>$null)
                $packageSha = [string](jq -er '.packageCommitSha // empty' $statusBodyFile 2>$null)
            }
            if ($lastHttpCode -eq '200' -and $reportedSha -eq $deployedCommitSha -and $packageSha -eq $deployedCommitSha) {
                $confirmed = $true
                break
            }
            if ($attempt -lt $StatusPollAttempts) {
                Start-Sleep -Seconds $StatusPollDelaySeconds
            }
        }

        if (-not $confirmed) {
            throw "Timed out after $StatusPollAttempts attempts: status endpoint did not report matching deployment and embedded package SHA=$deployedCommitSha during the $PhaseLabel check.`nLast observed HTTP status: $lastHttpCode`nLast observed response body: $lastBody"
        }
    }

    Write-Host "Waiting for deployment to report DEPLOYED_COMMIT_SHA=$deployedCommitSha ..."
    Wait-ForDeployedSha -PhaseLabel 'go-live'

    # --- Stamp DEPLOYED_AT_UTC only now that the new SHA is proven live -------
    # This is the cutover timestamp: exception validation must only consider
    # telemetry after this point, once the new (fixed) code is actually
    # serving traffic, not from when the settings/deploy calls were issued.
    $deployedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-Host "New commit is live. Stamping DEPLOYED_AT_UTC=$deployedAtUtc"
    az functionapp config appsettings set --resource-group $ResourceGroup --name $FunctionApp --settings "DEPLOYED_AT_UTC=$deployedAtUtc" --output none
    if ($LASTEXITCODE -ne 0) { throw "Failed to stamp DEPLOYED_AT_UTC." }

    # --- Re-confirm (bounded) the app is coherent after the cutover restart ---
    # Changing an app setting can restart the Function app; re-poll (bounded,
    # not unbounded/circular) to make sure it comes back reporting the same
    # SHA before declaring the deploy complete.
    Write-Host "Confirming the Function app is coherent after the cutover restart ..."
    Wait-ForDeployedSha -PhaseLabel 'cutover'

    Write-Host ""
    Write-Host "========================================"
    Write-Host "  Deploy complete: $deployedCommitSha (deployed at $deployedAtUtc)"
    Write-Host "========================================"
}
finally {
    if (-not $KeepTemp) {
        Remove-Item -Recurse -Force $WorkDir.FullName -ErrorAction SilentlyContinue
    }
}
