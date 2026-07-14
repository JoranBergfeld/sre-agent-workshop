#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelabapp", [string]$Workload = "srelabapp", [int]$Attempts = 12)
$ErrorActionPreference = 'Stop'
$web = az webapp list -g $ResourceGroup --query "[?starts_with(name,'$Workload-web-')].name | [0]" -o tsv
if (-not $web) { throw "No web app found in $ResourceGroup" }
$hostName = az webapp show -g $ResourceGroup --name $web --query defaultHostName -o tsv

$fail = 0
for ($i = 1; $i -le $Attempts; $i++) {
    try { $code = (Invoke-WebRequest -Uri "https://$hostName/api/red" -UseBasicParsing -SkipHttpErrorCheck).StatusCode }
    catch { $code = $_.Exception.Response.StatusCode.value__ }
    Write-Host "GET https://$hostName/api/red -> $code"
    if ($code -ne 200) { $fail++ }
}

if ($fail -eq 0) { Write-Host "Healthy: all $Attempts /api/red calls returned 200"; exit 0 }
Write-Error "Degraded: $fail/$Attempts /api/red calls were non-200"; exit 1
