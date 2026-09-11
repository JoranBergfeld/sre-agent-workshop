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

$vmSize = if ($env:VM_SIZE) { $env:VM_SIZE } else { 'Standard_D2s_v7' }
# az vm list-sizes ignores capacity restrictions and reports unavailable SKUs as
# present, so query list-skus and inspect the restrictions collection instead.
$restrictions = az vm list-skus --location $Location --resource-type virtualMachines `
    --query "[?name=='$vmSize'] | [0].restrictions | length(@)" -o tsv 2>$null
if (-not $restrictions) {
    Write-Fail "$vmSize is not offered in $Location for this subscription; choose another region or pass vmSize"
} elseif ($restrictions -ne '0') {
    Write-Fail "$vmSize is restricted in $Location (capacity or quota); choose another region or pass vmSize"
} else {
    Write-Ok "$vmSize available and unrestricted in $Location"
}

Write-Host "========================================"
if ($errors -eq 0) {
    Write-Host "  All checks passed."
} else {
    Write-Host "  $errors issue(s) detected."
}
Write-Host "========================================"
exit $errors
