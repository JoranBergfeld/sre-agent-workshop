param(
    [string]$ResourceGroup = "rg-srelabretirement"
)

$ErrorActionPreference = 'Stop'
$targetSize = "Standard_D2s_v5"
$filter = "[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
$affected = & az vm list --resource-group $ResourceGroup --query $filter -o tsv
if ($LASTEXITCODE -ne 0) {
    throw "az vm list failed with exit code $LASTEXITCODE."
}
$names = @($affected -split "`n" | Where-Object { $_.Trim().Length -gt 0 })

if ($names.Count -eq 0) {
    Write-Host "No VMs on a retiring size in $ResourceGroup. Nothing to migrate."
    exit 0
}

foreach ($name in $names) {
    Write-Host "Resizing $name -> $targetSize ..."
    & az vm resize --resource-group $ResourceGroup --name $name --size $targetSize --only-show-errors | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "az vm resize failed for '$name' with exit code $LASTEXITCODE."
    }
}

Write-Host "Migration complete. Resized $($names.Count) VM(s) to $targetSize."
