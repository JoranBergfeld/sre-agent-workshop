#!/usr/bin/env pwsh
param([string]$ResourceGroup, [string]$Workload = "srelabidentity", [string]$Namespace = "workload-identity-break", [string]$Deployment = "workload-identity-break-app", [switch]$Help)
$ErrorActionPreference = 'Stop'

if ($Help) {
    Write-Host "Usage: ./inject.ps1 [-ResourceGroup <rg>] [-Workload <name>]"
    exit 0
}

$ResourceGroup = if ($ResourceGroup) { $ResourceGroup } else { "rg-$Workload" }
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

$fedCred = "$Workload-fed-cred"
$identity = "$Workload-id"
$existing = az identity federated-credential list --identity-name $identity --resource-group $ResourceGroup --query "[?name=='$fedCred'].name" -o tsv
if ($existing) {
    az identity federated-credential delete --name $fedCred --identity-name $identity --resource-group $ResourceGroup --yes
    Write-Host "Deleted federated credential $fedCred on $identity"
} else { Write-Host "No federated credential '$fedCred' to delete (already broken?)" }
kubectl rollout restart "deployment/$Deployment" -n $Namespace
kubectl rollout status "deployment/$Deployment" -n $Namespace --timeout=90s
Write-Host "Fault injected: workload identity federated credential removed and pods restarted."
