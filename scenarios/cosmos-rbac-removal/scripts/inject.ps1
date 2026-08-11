#!/usr/bin/env pwsh
param([string]$ResourceGroup, [string]$Workload = "srelabcosmos", [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID, [string]$Namespace = "cosmos-rbac-removal", [string]$Deployment = "cosmos-rbac-removal-app", [switch]$Help)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host "Usage: ./inject.ps1 [-ResourceGroup <rg>] [-Workload <name>] [-SubscriptionId <id>]"
    exit 0
}

$ResourceGroup = if ($ResourceGroup) { $ResourceGroup } else { "rg-$Workload" }
$requestedSubscriptionId = $SubscriptionId
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

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
