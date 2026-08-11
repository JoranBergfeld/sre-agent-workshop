#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME,
    [int]$Attempts = 6
)

$ErrorActionPreference = "Stop"

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

if (-not $AppName) {
    $AppName = az webapp list --resource-group $ResourceGroup --query "[0].name" -o tsv
}

if (-not $AppName) {
    throw "No web app found in $ResourceGroup"
}

$hostName = az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv

for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    $response = Invoke-WebRequest `
        -Method Post `
        -Uri "https://$hostName/api/feature" `
        -SkipHttpErrorCheck
    Write-Host "Attempt ${attempt}: POST https://$hostName/api/feature -> $($response.StatusCode)"
}

Write-Host "Generated $Attempts unfinished-feature requests. The initial application should return HTTP 500."
