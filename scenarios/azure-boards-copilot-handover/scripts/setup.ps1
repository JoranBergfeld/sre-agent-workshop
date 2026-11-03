#!/usr/bin/env pwsh
# Provisions the Azure Boards Copilot Handover scenario end-to-end: verifies the
# pre-created designated group and the deployable package read-only, deploys the
# subscription-scope infrastructure, deploys the (intentionally flawed, v1-only)
# starting application, seeds the deterministic v1 control events, and prints
# the keyed workshop URLs a learner needs next.

param()

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '../../..')).Path
$ScenarioDir = Join-Path $RepoRoot 'scenarios/azure-boards-copilot-handover'

$Workload = 'srelabboardshandover'
$ResourceGroup = ''
$ResourceGroupSet = $false
$Location = 'eastus2'
$BuildMode = 'artifact'
$ArtifactRepo = ''

$RetryAttempts = if ($env:RETRY_ATTEMPTS) { [int]$env:RETRY_ATTEMPTS } else { 10 }
$RetryDelaySeconds = if ($env:RETRY_DELAY_SECONDS) { [int]$env:RETRY_DELAY_SECONDS } else { 15 }

function Show-Usage {
    @"
Usage: .\setup.ps1 [--workload <name>] [--resource-group <name>] [--location <region>] [--subscription-id <id>] [--build-mode artifact|source] [--repo owner/name] [--help]

Provisions the Azure Boards Copilot Handover scenario: infrastructure,
starting application, and the deterministic v1 control-event seed.

Options:
  -w, -Workload, --workload             Workload name: 6-24 lowercase letters/numbers/hyphens (default: srelabboardshandover)
  -g, -ResourceGroup, --resource-group  Resource group name (default: <workload>-rg)
  -l, -Location, --location             Azure region (default: eastus2)
  -s, -SubscriptionId, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
  -BuildMode, --build-mode              artifact (default): trusted exact-HEAD package built by the
                                        scenario's GitHub Actions workflow; source: local quality
                                        gates + remote Oryx build (needs Python tooling)
  -Repo, --repo                         Explicit artifact repository owner/name (default: Git origin)
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
$deployArguments = @('--build-mode', $BuildMode)
if ($ArtifactRepo) { $deployArguments += @('--repo', $ArtifactRepo) }

Write-Host "========================================"
Write-Host "  Azure Boards Copilot Handover — Setup"
Write-Host "========================================"
Write-Host "Workload: $Workload"
Write-Host "Location: $Location"

foreach ($requiredCommand in @('az', 'curl', 'jq', 'node')) {
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

# Read-only preflight before anything is changed: the placement check verifies
# the operator pre-created and designated the group (or that it holds a
# verified earlier deployment) and that a supported region passes, and the
# artifact resolver proves a trusted exact-HEAD package exists. Failing either
# leaves Azure untouched.
$checkArguments = @('scripts/placement/provision.mjs', 'check', 'azure-boards-copilot-handover', '--location', $Location, '--workload', $Workload, '--require-group')
if ($ResourceGroupSet) { $checkArguments += @('--resource-group', $ResourceGroup) }
Push-Location $RepoRoot
try { & node @checkArguments } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'Placement/ownership preflight failed; nothing was changed.' }
if ($BuildMode -eq 'artifact') {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Authenticated GitHub CLI (gh) is required for artifact deployment (or use --build-mode source).' }
    $preflightDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "sre-boards-preflight-$([Guid]::NewGuid())"
    $resolverArguments = @('scripts/build-artifacts/resolve.mjs', '--scenario', 'azure-boards-copilot-handover', '--variant', 'application', '--output-dir', $preflightDirectory)
    if ($ArtifactRepo) { $resolverArguments += @('--repo', $ArtifactRepo) }
    Push-Location $RepoRoot
    try { & node @resolverArguments | Out-Null; $resolverExitCode = $LASTEXITCODE }
    finally { Pop-Location; Remove-Item -LiteralPath $preflightDirectory -Recurse -Force -ErrorAction SilentlyContinue }
    if ($resolverExitCode -ne 0) { throw 'No trusted exact-HEAD application package is available; nothing was changed. Dispatch the build shown above, or rerun with --build-mode source.' }
}

# The shared placement engine deploys infra/bicep/main.bicep into the resource
# group the operator pre-created and designated (it never creates or upserts a
# group), choosing the first eligible region and retrying only proven
# non-mutating capacity/SKU/quota rejections. An existing deployment is never
# relocated. Options: scripts/placement/provision.mjs --help
Write-Host "Provisioning subscription-scope infrastructure (infra/bicep/main.bicep) via scripts/placement..."
$placementArguments = @('scripts/placement/provision.mjs', 'deploy', 'azure-boards-copilot-handover', '--location', $Location, '--workload', $Workload)
if ($ResourceGroupSet) { $placementArguments += @('--resource-group', $ResourceGroup) }
$outputsFile = [System.IO.Path]::GetTempFileName()
try {
    Push-Location $RepoRoot
    try { & node @placementArguments --outputs-file $outputsFile } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Infrastructure provisioning failed; see the placement output above." }
    $deploymentOutputs = Get-Content -Raw $outputsFile
}
finally {
    Remove-Item -LiteralPath $outputsFile -Force -ErrorAction SilentlyContinue
}

$discoveredResourceGroup = [string]($deploymentOutputs | jq -er '.resourceGroupName.value').Trim()
$functionApp = [string]($deploymentOutputs | jq -er '.functionAppName.value').Trim()
$functionHostname = [string]($deploymentOutputs | jq -er '.functionAppHostName.value').Trim()

if ($ResourceGroupSet -and $ResourceGroup -ne $discoveredResourceGroup) {
    throw "Requested resource group '$ResourceGroup' differs from the provisioned resource group '$discoveredResourceGroup'."
}
$ResourceGroup = $discoveredResourceGroup

Write-Host "Resource group: $ResourceGroup"
Write-Host "Function app:   $functionApp"

Write-Host "Deploying the starting application ($BuildMode mode) (bounded retry for Function startup/RBAC propagation)..."
$deploySucceeded = $false
$lastDeployErrorMessage = ''
for ($attempt = 1; $attempt -le $RetryAttempts; $attempt++) {
    try {
        & (Join-Path $ScriptDir 'deploy.ps1') -ResourceGroup $ResourceGroup -AppName $functionApp @deployArguments
        $deploySucceeded = $true
        break
    }
    catch {
        $lastDeployErrorMessage = if ($_.Exception.Message) { $_.Exception.Message } else { $_.ToString() }
        if ($attempt -lt $RetryAttempts) {
            Write-Warning "Deploy attempt $attempt failed; retrying in ${RetryDelaySeconds}s. Last error: $lastDeployErrorMessage"
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }
}

if (-not $deploySucceeded) {
    throw "Failed after $RetryAttempts attempts: deploying the starting application (startup/RBAC propagation may still be in progress). Last error: $lastDeployErrorMessage"
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
