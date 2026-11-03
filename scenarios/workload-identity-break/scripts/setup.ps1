# Pre-workshop validation — checks that required tools and config are in place.
# Usage from repository root:
#   .\scenarios\workload-identity-break\scripts\setup.ps1
#   .\scenarios\workload-identity-break\scripts\setup.ps1 -Location swedencentral

param(
    [string]$Location = "eastus2",
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [switch]$Help
)

$errors = 0
if ($Help) {
    Write-Host "Usage: ./setup.ps1 [-SubscriptionId <id>] [-Location <region>]"
    exit 0
}

$requestedSubscriptionId = $SubscriptionId
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

function Write-Header($text) { Write-Host "`n-- $text --" }
function Write-Ok($text)     { Write-Host "  ✅ $text" }
function Write-Fail($text)   { $script:errors++; Write-Host "  ❌ $text" }
function Write-Warn($text)   { Write-Host "  ⚠️  $text" }

Write-Host "========================================"
Write-Host "  SRE Agent Workshop — Setup Check"
Write-Host "========================================"

# -- Azure CLI ---
Write-Header "Azure CLI"
if (Get-Command az -ErrorAction SilentlyContinue) {
    $azVersion = (az version --query '"azure-cli"' -o tsv 2>$null) ?? "unknown"
    Write-Ok "az CLI installed ($azVersion)"
} else {
    Write-Fail "az CLI not found — install: https://aka.ms/install-azure-cli"
}

# -- Azure login ---
Write-Header "Azure Authentication"
$acct = az account show 2>$null | ConvertFrom-Json
if ($acct) {
    Write-Ok "Logged in — $($acct.name) ($($acct.id))"
} else {
    Write-Fail "Not logged in — run: az login"
}

# -- Azure subscription ---
Write-Header "Azure Subscription"
if ($acct) {
    Write-Ok "Subscription: $($acct.id)"
} else {
    Write-Fail "No active subscription"
}

# -- Resource Providers ---
Write-Header "Azure Resource Providers"
if ($acct) {
    $requiredProviders = @(
        "Microsoft.ContainerService"
        "Microsoft.DocumentDB"
        "Microsoft.OperationalInsights"
        "Microsoft.Insights"
        "Microsoft.ManagedIdentity"
        "Microsoft.OperationsManagement"
    )
    foreach ($ns in $requiredProviders) {
        $state = az provider show --namespace $ns --query registrationState -o tsv 2>$null
        if ($state -eq "Registered") {
            Write-Ok "$ns — Registered"
        } else {
            Write-Fail "$ns — $state"
            Write-Host "       Register with: az provider register --namespace $ns"
        }
    }
} else {
    Write-Warn "Skipped — not logged in to Azure"
}

# -- kubectl ---
Write-Header "kubectl"
if (Get-Command kubectl -ErrorAction SilentlyContinue) {
    $kv = kubectl version --client -o json 2>$null | ConvertFrom-Json
    $kvStr = if ($kv) { $kv.clientVersion.gitVersion } else { "unknown" }
    Write-Ok "kubectl installed ($kvStr)"
} else {
    Write-Fail "kubectl not found — install: https://kubernetes.io/docs/tasks/tools/"
}

# -- GitHub CLI (optional) ---
Write-Header "GitHub CLI"
if (Get-Command gh -ErrorAction SilentlyContinue) {
    $ghv = (gh --version | Select-Object -First 1)
    Write-Ok "gh CLI installed ($ghv)"
} else {
    Write-Warn "gh CLI not found (optional) — install: https://cli.github.com"
}

# -- Placement preflight ---
Write-Header "Region, VM Size and Quota"
Write-Host "  Candidate regions, Kubernetes versions and node sizes: scenarios/workload-identity-break/infra/placement.json"
Write-Host "  Deployment falls back through them in order; existing deployments stay pinned."
if ($acct) {
    # Region, VM family, SKU restriction and quota preflight from
    # infra/placement.json. Deployment falls back through the same ordered list.
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Fail "Node.js 20+ not found (it runs the shared placement engine)"
    } else {
        & node (Join-Path $repoRoot 'scripts/placement/provision.mjs') check workload-identity-break --location $Location
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Placement preflight found an eligible region, AKS version, node VM size and quota"
        } else {
            Write-Fail "Placement preflight found no eligible region, AKS version, node VM size or quota (reasons above)"
        }
    }
} else {
    Write-Warn "Skipped — not logged in to Azure"
}

# -- Summary ---
Write-Host ""
Write-Host "========================================"
if ($errors -eq 0) {
    Write-Host "  All checks passed — you're ready! 🚀"
} else {
    Write-Host "  $errors issue(s) found — please fix before starting."
}
Write-Host "========================================"
exit $errors
