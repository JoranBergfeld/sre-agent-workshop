# Runs a PowerShell script on an Azure Arc-enabled server through Arc Run Command.
param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][Alias('VmName')][string]$MachineName,
    [Parameter(Mandatory = $true)][string]$Script
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId | Out-Null }
if ($LASTEXITCODE) { throw "Unable to select the requested Azure subscription." }
az account show | Out-Null
if ($LASTEXITCODE) { throw "Azure CLI is not authenticated. Run 'az login'." }
$commandName = "arc-disk-pressure-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))-$PID"
az connectedmachine run-command create `
    --resource-group $ResourceGroup `
    --machine-name $MachineName `
    --run-command-name $commandName `
    --script $Script `
    --output none
if ($LASTEXITCODE) { throw "Failed to create Arc Run Command '$commandName'." }
try {
    $state = ''
    for ($attempt = 1; $attempt -le 24; $attempt++) {
        $state = az connectedmachine run-command show `
            --resource-group $ResourceGroup `
            --machine-name $MachineName `
            --run-command-name $commandName `
            --query "properties.instanceView.executionState" `
            --output tsv 2>$null
        if ($LASTEXITCODE -eq 0 -and $state.Trim() -in @('Succeeded','success','succeeded')) {
            Write-Host "Arc Run Command '$commandName' completed."
            break
        }
        if ($state.Trim() -in @('Failed','failed','Canceled','canceled')) {
            throw "Arc Run Command '$commandName' returned state '$state'."
        }
        if ($attempt -eq 24) { throw "Arc Run Command '$commandName' timed out." }
        Start-Sleep -Seconds 5
    }
} finally {
    az connectedmachine run-command delete `
        --resource-group $ResourceGroup `
        --machine-name $MachineName `
        --run-command-name $commandName `
        --yes | Out-Null
}
