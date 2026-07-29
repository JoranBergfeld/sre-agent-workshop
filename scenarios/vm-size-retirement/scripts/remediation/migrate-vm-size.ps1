param(
    [string]$ResourceGroup = "rg-srelabretirement"
)

$ErrorActionPreference = 'Stop'
$targetSize = "Standard_D2s_v5"
$filter = "[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
$resultPath = $env:SRE_REMEDIATION_RESULT_FILE
$completed = 0
$currentVm = ""

function Write-RemediationResult {
    param(
        [string]$Status,
        [int]$Completed,
        [string]$FailedVm = ""
    )

    if (-not [string]::IsNullOrWhiteSpace($resultPath)) {
        [PSCustomObject]@{
            status = $Status
            completed = $Completed
            failedVm = $FailedVm
        } | ConvertTo-Json -Compress | Set-Content -Path $resultPath
    }
}

try {
    $affected = & az vm list --resource-group $ResourceGroup --query $filter -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw "az vm list failed with exit code $LASTEXITCODE."
    }
    $names = @($affected -split "`n" | Where-Object { $_.Trim().Length -gt 0 })

    if ($names.Count -eq 0) {
        Write-RemediationResult -Status "succeeded" -Completed 0
        Write-Host "No VMs on a retiring size in $ResourceGroup. Nothing to migrate."
        return
    }

    foreach ($name in $names) {
        $currentVm = $name
        Write-Host "Resizing $name -> $targetSize ..."
        & az vm resize --resource-group $ResourceGroup --name $name --size $targetSize --only-show-errors | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "az vm resize failed for '$name' with exit code $LASTEXITCODE."
        }
        $completed++
    }

    Write-RemediationResult -Status "succeeded" -Completed $completed
    Write-Host "Migration complete. Resized $completed VM(s) to $targetSize."
} catch {
    Write-RemediationResult -Status "failed" -Completed $completed -FailedVm $currentVm
    throw "Migration failed after completed $completed VM(s); failed VM: $($currentVm ?? 'unknown'). $($_.Exception.Message)"
}
