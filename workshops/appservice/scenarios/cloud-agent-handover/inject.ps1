#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME,
    [int]$Attempts = 6
)

$ErrorActionPreference = "Stop"

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
