#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelab", [string]$Namespace = "workshop", [string]$Deployment = "web-app")
$ErrorActionPreference = 'Stop'
$cosmos = az cosmosdb list --resource-group $ResourceGroup --query "[0].name" -o tsv
if (-not $cosmos) { throw "No CosmosDB account found in $ResourceGroup" }
$assignment = az cosmosdb sql role assignment list --account-name $cosmos --resource-group $ResourceGroup --query "[0].name" -o tsv
if ($assignment) {
    az cosmosdb sql role assignment delete --account-name $cosmos --resource-group $ResourceGroup --role-assignment-id $assignment --yes
    Write-Host "Deleted role assignment $assignment on $cosmos"
} else { Write-Host "No role assignment to delete (already broken?)" }
kubectl rollout restart "deployment/$Deployment" -n $Namespace
kubectl rollout status "deployment/$Deployment" -n $Namespace --timeout=90s
Write-Host "Fault injected: CosmosDB RBAC removed and pods restarted."
