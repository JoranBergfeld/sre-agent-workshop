param(
    [string]$Location = "eastus2",
    [string]$SreAgentPrincipalId = $env:SRE_AGENT_PRINCIPAL_ID
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$errors = 0
function Write-Ok($text) { Write-Host "  PASS: $text" }
function Write-Fail($text) {
    $script:errors++
    Write-Host "  FAIL: $text"
}

Write-Host "VM Size Retirement — Setup Check"

if (Get-Command az -ErrorAction SilentlyContinue) {
    Write-Ok "Azure CLI installed"
} else {
    Write-Fail "Azure CLI not found"
}

Write-Ok "Azure subscription verified"

# Region, VM family, SKU restriction and quota preflight from
# infra/placement.json. Deployment falls back through the same ordered list.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail "Node.js 20+ not found (it runs the shared placement engine)"
} else {
    & node (Join-Path $repoRoot 'scripts/placement/provision.mjs') check vm-size-retirement --location $Location
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Placement preflight found an eligible region, baseline VM size, real DSv2 legacy fleet, remediation target and quota"
    } else {
        Write-Fail "Placement preflight found no eligible region, baseline VM size, real DSv2 legacy fleet, remediation target and quota (reasons above)"
    }
}

$parsedPrincipalId = [guid]::Empty
if ([string]::IsNullOrWhiteSpace($SreAgentPrincipalId)) {
    Write-Host "  INFO: no SRE Agent principal ID supplied; deployment will not assign SRE Agent roles."
} elseif ([guid]::TryParse($SreAgentPrincipalId, [ref]$parsedPrincipalId)) {
    Write-Ok "SRE Agent principal ID format is valid"
} else {
    Write-Fail "SRE Agent principal ID must be an object ID GUID"
}

exit $errors
