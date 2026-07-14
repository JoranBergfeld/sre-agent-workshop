#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelabapp", [string]$Workload = "srelabapp")
$ErrorActionPreference = 'Stop'
$web = az webapp list -g $ResourceGroup --query "[?starts_with(name,'$Workload-web-')].name | [0]" -o tsv
if (-not $web) { throw "No web app found in $ResourceGroup" }

az webapp config appsettings set -g $ResourceGroup --name $web --settings RED_BUTTON_MODE=ok -o none
Write-Host "Operational mitigation applied: RED_BUTTON_MODE=ok on $web — /api/red now returns 200."
