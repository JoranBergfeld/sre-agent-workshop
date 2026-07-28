#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelab", [string]$Workload = "srelab", [string]$Namespace = "workshop", [string]$Deployment = "web-app")
$ErrorActionPreference = 'Stop'
$roleDefId = "00000000-0000-0000-0000-000000000002"
$cosmos = az cosmosdb list --resource-group $ResourceGroup --query "[0].name" -o tsv
$principalId = az identity show --name "$Workload-id" --resource-group $ResourceGroup --query principalId -o tsv
az cosmosdb sql role assignment create --account-name $cosmos --resource-group $ResourceGroup --role-definition-id $roleDefId --principal-id $principalId --scope "/"
Write-Host "Recreated CosmosDB role assignment for $Workload-id on $cosmos"
kubectl rollout restart "deployment/$Deployment" -n $Namespace
kubectl rollout status "deployment/$Deployment" -n $Namespace --timeout=90s
Write-Host "Remediation complete: RBAC restored and pods restarted."
