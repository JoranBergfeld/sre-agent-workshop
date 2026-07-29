param(
    [string]$Location = "eastus2"
)

$errors = 0
function Write-Ok($text)   { Write-Host "  ✅ $text" }
function Write-Fail($text) { $script:errors++; Write-Host "  ❌ $text" }

Write-Host "========================================"
Write-Host "  Disk Full Scenario — Setup Check"
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

$acct = az account show 2>$null | ConvertFrom-Json
if ($acct) {
    Write-Ok "Azure login detected"
} else {
    Write-Fail "Not logged in to Azure"
}

$size = az vm list-sizes --location $Location --query "[?name=='Standard_B2s'].name" -o tsv 2>$null
if ($size) {
    Write-Ok "Standard_B2s available in $Location"
} else {
    Write-Fail "Standard_B2s unavailable in $Location; update vmSize in scenarios/disk-full/infra/bicep/modules/vm.bicep"
}

Write-Host "========================================"
if ($errors -eq 0) {
    Write-Host "  All checks passed."
} else {
    Write-Host "  $errors issue(s) detected."
}
Write-Host "========================================"
exit $errors
