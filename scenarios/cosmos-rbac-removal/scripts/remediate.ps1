#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelab", [string]$Workload = "srelab", [string]$Namespace = "workshop", [string]$Deployment = "web-app")
$ErrorActionPreference = 'Stop'
$roleDefId = "00000000-0000-0000-0000-000000000002"

function Assert-CommandSucceeded([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

$cosmos = az cosmosdb list --resource-group $ResourceGroup --query "[0].name" -o tsv
Assert-CommandSucceeded 'Resolving the CosmosDB account'
$principalId = az identity show --name "$Workload-id" --resource-group $ResourceGroup --query principalId -o tsv
Assert-CommandSucceeded 'Resolving the workload managed identity'
$existingAssignment = az cosmosdb sql role assignment list --account-name $cosmos --resource-group $ResourceGroup --query "[?principalId=='$principalId' && contains(roleDefinitionId, '$roleDefId') && scope=='/'].name | [0]" -o tsv
Assert-CommandSucceeded 'Listing existing CosmosDB role assignments'

if ($existingAssignment) {
    Write-Host "CosmosDB role assignment '$existingAssignment' already exists for $Workload-id on $cosmos. No changes made."
    exit 0
}

az cosmosdb sql role assignment create --account-name $cosmos --resource-group $ResourceGroup --role-definition-id $roleDefId --principal-id $principalId --scope "/"
Assert-CommandSucceeded 'Creating the CosmosDB role assignment'
Write-Host "Recreated CosmosDB role assignment for $Workload-id on $cosmos"
kubectl rollout restart "deployment/$Deployment" -n $Namespace
Assert-CommandSucceeded 'Restarting the workload deployment'
kubectl rollout status "deployment/$Deployment" -n $Namespace --timeout=90s
Assert-CommandSucceeded 'Waiting for the workload rollout'
Write-Host "Remediation complete: RBAC restored and pods restarted."
