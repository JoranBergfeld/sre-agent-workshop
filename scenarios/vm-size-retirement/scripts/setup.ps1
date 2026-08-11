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

$size = az vm list-sizes --location $Location --query "[?name=='Standard_B2s'].name" -o tsv 2>$null
if ($size -eq "Standard_B2s") {
    Write-Ok "Standard_B2s available in $Location"
} else {
    Write-Fail "Standard_B2s unavailable in $Location"
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
