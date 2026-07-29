param(
    [string]$Location = "eastus2",
    [string]$SreAgentPrincipalId = $env:SRE_AGENT_PRINCIPAL_ID
)

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

$account = az account show 2>$null | ConvertFrom-Json
if ($account) {
    Write-Ok "Azure login detected"
} else {
    Write-Fail "Not logged in to Azure"
}

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
