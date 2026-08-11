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
Write-Host "  IIS App Pool Failure — Setup Check"
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

$size = az vm list-sizes --location $Location --query "[?name=='Standard_B2s'].name" -o tsv 2>$null
if ($size) {
    Write-Ok "Standard_B2s available in $Location"
} else {
    Write-Fail "Standard_B2s unavailable in $Location; update vmSize in scenarios/iis-app-pool/infra/bicep/modules/vm.bicep"
}

Write-Host "========================================"
if ($errors -eq 0) {
    Write-Host "  All checks passed."
} else {
    Write-Host "  $errors issue(s) detected."
}
Write-Host "========================================"
exit $errors
