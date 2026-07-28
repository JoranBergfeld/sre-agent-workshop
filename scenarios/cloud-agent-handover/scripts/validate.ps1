#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME
)

$ErrorActionPreference = "Stop"

if (-not $AppName) {
    $AppName = az webapp list --resource-group $ResourceGroup --query "[0].name" -o tsv
}

if (-not $AppName) {
    throw "No web app found in $ResourceGroup"
}

$hostName = az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv
$response = Invoke-WebRequest `
    -Method Post `
    -Uri "https://$hostName/api/feature" `
    -SkipHttpErrorCheck

if ($response.StatusCode -ne 200) {
    throw "Degraded: POST /api/feature returned HTTP $($response.StatusCode)"
}

$payload = $response.Content | ConvertFrom-Json
if (
    $payload.status -ne "completed" -or
    $payload.message -ne "The unfinished feature is now implemented."
) {
    throw "POST /api/feature returned an unexpected response contract"
}

Write-Host "Healthy: POST /api/feature returned the implemented HTTP 200 contract."
