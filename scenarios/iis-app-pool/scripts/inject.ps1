# Scenario 2 — IIS App Pool Failure. Stops a target IIS application pool to
# simulate a stopped backend; the scenario alert + agent flow take it from there.
param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisa-01",
    [string]$AppPoolName = "DefaultAppPool"
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$script = @"
Import-Module WebAdministration
Stop-WebAppPool -Name '$AppPoolName'
Write-Output 'Stopped app pool $AppPoolName'
"@

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
