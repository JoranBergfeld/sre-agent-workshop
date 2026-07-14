#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelabapp", [string]$Workload = "srelabapp", [int]$Attempts = 20)
$ErrorActionPreference = 'Stop'
$web = az webapp list -g $ResourceGroup --query "[?starts_with(name,'$Workload-web-')].name | [0]" -o tsv
if (-not $web) { throw "No web app found in $ResourceGroup" }

# Arm the fault. The app defaults to broken, but re-assert in case a prior run mitigated it.
az webapp config appsettings set -g $ResourceGroup --name $web --settings RED_BUTTON_MODE=broken -o none
Write-Host "Armed RED_BUTTON_MODE=broken on $web. Waiting for the app to restart…"
Start-Sleep -Seconds 15

$hostName = az webapp show -g $ResourceGroup --name $web --query defaultHostName -o tsv
for ($i = 1; $i -le $Attempts; $i++) {
    try { $code = (Invoke-WebRequest -Uri "https://$hostName/api/red" -UseBasicParsing -SkipHttpErrorCheck).StatusCode }
    catch { $code = $_.Exception.Response.StatusCode.value__ }
    Write-Host "GET https://$hostName/api/red -> $code"
}
Write-Host "Fault injected: $Attempts red-button presses against $web (/api/red returns HTTP 500)."
