# Runs a PowerShell script on an Azure Arc-enabled server through Arc Run Command.
#
# `az connectedmachine run-command create` is synchronous and requires
# --location; it returns the terminal instanceView directly, so no polling is
# needed. The command resource is always deleted afterwards.
param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][Alias('VmName')][string]$MachineName,
    [Parameter(Mandatory = $true)][string]$Script,
    [string]$Location
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId | Out-Null }
if ($LASTEXITCODE) { throw "Unable to select the requested Azure subscription." }
az account show | Out-Null
if ($LASTEXITCODE) { throw "Azure CLI is not authenticated. Run 'az login'." }

# The run command resource must be created in the Arc machine's own region.
if (-not $Location) {
    $Location = az connectedmachine show `
        --resource-group $ResourceGroup `
        --machine-name $MachineName `
        --query location --output tsv
    if ($LASTEXITCODE -or -not $Location) {
        throw "Unable to resolve the location of Arc-enabled server '$MachineName'."
    }
}

$commandName = "arc-disk-pressure-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))-$PID"
try {
    $raw = az connectedmachine run-command create `
        --resource-group $ResourceGroup `
        --machine-name $MachineName `
        --run-command-name $commandName `
        --location $Location `
        --script $Script `
        --output json
    if ($LASTEXITCODE) { throw "Failed to create Arc Run Command '$commandName'." }

    $view = ($raw | ConvertFrom-Json).instanceView
    if ($view.output) { Write-Output $view.output }

    if ($view.executionState -notin @('Succeeded', 'succeeded', 'success')) {
        throw "Arc Run Command '$commandName' returned state '$($view.executionState)'. $($view.error)"
    }
    if ($view.exitCode -ne 0 -or $view.error) {
        throw "Arc Run Command '$commandName' exited with code $($view.exitCode). $($view.error)"
    }
    Write-Host "Arc Run Command '$commandName' completed."
} finally {
    az connectedmachine run-command delete `
        --resource-group $ResourceGroup `
        --machine-name $MachineName `
        --run-command-name $commandName `
        --no-wait `
        --yes 2>$null | Out-Null
}
