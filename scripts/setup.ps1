# Pre-workshop validation — checks that required tools and config are in place.
# Usage: .\scripts\setup.ps1
#        .\scripts\setup.ps1 -Location swedencentral

param(
    [string]$Location = "eastus2"
)

$errors = 0

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

# -- Region check ---
Write-Header "Supported Regions"
Write-Host "  The workshop supports: eastus2, swedencentral, australiaeast"
Write-Host "  Set your preferred region when running the deploy-infra workflow."

# -- VM Size availability ---
Write-Header "VM Size Availability"
$vmSize = "Standard_D2ads_v6"
if ($acct) {
    $available = az vm list-sizes --location $Location --query "[?name=='$vmSize'].name" -o tsv 2>$null
    if ($available) {
        Write-Ok "$vmSize is available in $Location"
    } else {
        Write-Fail "$vmSize is NOT available in $Location"
        Write-Host ""
        Write-Host "  The default AKS node VM size ($vmSize) is not available in your"
        Write-Host "  subscription/region. You need to edit infra/bicep/modules/aks.bicep"
        Write-Host "  and change the 'vmSize' property to an available 2-vCPU size."
        Write-Host ""
        Write-Host "  Suggested alternatives (any 2-vCPU general-purpose VM will work):"
        Write-Host "    - Standard_D2s_v3"
        Write-Host "    - Standard_D2as_v5"
        Write-Host "    - Standard_D2s_v5"
        Write-Host "    - Standard_B2s"
        Write-Host ""
        Write-Host "  To see all available sizes in your region:"
        Write-Host "    az vm list-sizes --location $Location --query `"[?numberOfCores==``2``].name`" -o table"
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
