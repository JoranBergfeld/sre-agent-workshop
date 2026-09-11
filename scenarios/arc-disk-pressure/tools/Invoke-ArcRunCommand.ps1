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
$result = az connectedmachine run-command create `
    --resource-group $ResourceGroup `
    --machine-name $MachineName `
    --run-command-name $commandName `
    --script $Script `
    --query "properties.instanceView.executionState" `
    --output tsv
if ($LASTEXITCODE) { throw "Failed to create Arc Run Command '$commandName'." }
try {
    if ($result -and $result.Trim() -notin @('Succeeded','success','succeeded')) {
        throw "Arc Run Command '$commandName' returned state '$result'."
    }
    Write-Host "Arc Run Command '$commandName' completed."
} finally {
    az connectedmachine run-command delete `
        --resource-group $ResourceGroup `
        --machine-name $MachineName `
        --run-command-name $commandName `
        --yes | Out-Null
}
