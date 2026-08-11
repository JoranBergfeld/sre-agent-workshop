param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01",
    [string]$BastionName = "srelabcpurunaway-bas",
    [int]$LocalPort = 18080
)


$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
Write-Host "========================================"
Write-Host "  CPU Runaway Scenario Smoke Test"
Write-Host "========================================"

$powerState = az vm get-instance-view --resource-group $ResourceGroup --name $VmName --query "instanceView.statuses[1].displayStatus" -o tsv
if ($LASTEXITCODE -ne 0 -or -not $powerState) {
    throw "Unable to read VM power state."
}
Write-Host "Power state: $powerState"

$vmId = az vm show --resource-group $ResourceGroup --name $VmName --query "id" -o tsv
if ($LASTEXITCODE -ne 0 -or -not $vmId) {
    throw "Unable to read VM resource ID."
}
Write-Host "VM resource ID: $vmId"
Write-Host "Starting Bastion tunnel on localhost:$LocalPort ..."

$portInUse = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    throw "Local port $LocalPort is already in use by PID $($portInUse.OwningProcess). Stop that process or choose a different LocalPort."
}

$tunnelProcess = Start-Process `
    -FilePath "az" `
    -ArgumentList @(
        "network", "bastion", "tunnel",
        "--name", $BastionName,
        "--resource-group", $ResourceGroup,
        "--target-resource-id", $vmId,
        "--resource-port", "80",
        "--port", "$LocalPort"
    ) `
    -PassThru `
    -WindowStyle Hidden

Start-Sleep -Seconds 12

try {
    $statusCode = & curl.exe -s --max-time 20 -o NUL -w "%{http_code}" "http://127.0.0.1:$LocalPort"
    if ($LASTEXITCODE -ne 0 -or $statusCode -ne "200") {
        throw "IIS endpoint check failed through Bastion tunnel (status: $statusCode)"
    }
    Write-Host "HTTP status: $statusCode"
    Write-Host "Smoke test passed."
}
finally {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) {
        Stop-Process -Id $tunnelProcess.Id
    }
}
