#!/usr/bin/env pwsh
param(
    [ValidateNotNullOrEmpty()]
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) {
        $env:AZURE_RESOURCE_GROUP
    }
    else {
        "rg-srelabapp"
    })
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Required command not found: az"
}

& az group delete --name $ResourceGroup --yes --no-wait
if ($LASTEXITCODE -ne 0) {
    throw "Command 'az' failed with exit code $LASTEXITCODE."
}

Write-Host "Deletion started for $ResourceGroup."
