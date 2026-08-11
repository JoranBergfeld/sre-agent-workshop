#!/usr/bin/env pwsh
param([string]$ResourceGroup, [string]$Workload = "srelabcosmos", [string]$Namespace = "cosmos-rbac-removal", [string]$Deployment = "cosmos-rbac-removal-app", [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID, [switch]$Help)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host "Usage: ./remediate.ps1 [-ResourceGroup <rg>] [-Workload <name>] [-SubscriptionId <id>]"
    exit 0
}

$roleDefId = "00000000-0000-0000-0000-000000000002"
$ResourceGroup = if ($ResourceGroup) { $ResourceGroup } else { "rg-$Workload" }

function Assert-CommandSucceeded([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

$requestedSubscriptionId = $SubscriptionId
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

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
