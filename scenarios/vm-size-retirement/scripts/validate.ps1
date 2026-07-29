param(
    [string]$ResourceGroup = "rg-srelabretirement"
)

$ErrorActionPreference = 'Stop'
$filter = "[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
$remaining = & az vm list --resource-group $ResourceGroup --query $filter -o tsv
if ($LASTEXITCODE -ne 0) {
    throw "az vm list failed with exit code $LASTEXITCODE."
}

if ($remaining -and $remaining.Trim().Length -gt 0) {
    Write-Error "FAIL: VMs still on a retiring size:`n$remaining"
    exit 1
}

Write-Host "PASS: no VMs on a retiring size in $ResourceGroup."
