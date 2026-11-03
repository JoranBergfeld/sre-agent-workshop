param(
    [string]$Location = "eastus2"
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$errors = 0
function Write-Ok($text)   { Write-Host "  ✅ $text" }
function Write-Fail($text) { $script:errors++; Write-Host "  ❌ $text" }

Write-Host "========================================"
Write-Host "  Arc-Enabled Server Disk Pressure Scenario — Setup Check"
Write-Host "========================================"

if (Get-Command az -ErrorAction SilentlyContinue) {
    Write-Ok "Azure CLI installed"
} else {
    Write-Fail "Azure CLI not found"
}

if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Ok "GitHub CLI installed"
} else {
    Write-Ok "GitHub CLI optional and not installed"
}

Write-Ok "Azure subscription verified"

# Region, VM family, SKU restriction and quota preflight from
# infra/placement.json. Deployment falls back through the same ordered list.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js 20+ not found (it runs the shared placement engine)"
} else {
    & node (Join-Path $repoRoot 'scripts/placement/provision.mjs') check arc-disk-pressure --location $Location
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Placement preflight found an eligible region, VM size and quota"
    } else {
        Write-Fail "Placement preflight found no eligible region, VM size or quota (reasons above)"
    }
}

Write-Host "========================================"
if ($errors -eq 0) {
    Write-Host "  All checks passed."
} else {
    Write-Host "  $errors issue(s) detected."
}
Write-Host "========================================"
exit $errors
