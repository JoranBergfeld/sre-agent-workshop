#!/usr/bin/env pwsh
param([string]$ResourceGroup, [string]$Workload = "srelabidentity", [string]$Namespace = "workload-identity-break", [string]$Deployment = "workload-identity-break-app", [switch]$Help)
$ErrorActionPreference = 'Stop'

if ($Help) {
	Write-Host "Usage: ./remediate.ps1 [-ResourceGroup <rg>] [-Workload <name>]"
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
$subject = "system:serviceaccount:workload-identity-break:workload-identity-break-app"
$audience = "api://AzureADTokenExchange"
$cluster = az aks list --resource-group $ResourceGroup --query "[0].name" -o tsv
if (-not $cluster) { throw "No AKS cluster found in $ResourceGroup" }
$oidcIssuer = az aks show --resource-group $ResourceGroup --name $cluster --query oidcIssuerProfile.issuerUrl -o tsv
if (-not $oidcIssuer) { throw "Could not resolve OIDC issuer for $cluster" }
az identity federated-credential create --name $fedCred --identity-name $identity --resource-group $ResourceGroup --issuer $oidcIssuer --subject $subject --audiences $audience
Write-Host "Recreated federated credential $fedCred on $identity (issuer $oidcIssuer)"
kubectl rollout restart "deployment/$Deployment" -n $Namespace
kubectl rollout status "deployment/$Deployment" -n $Namespace --timeout=90s
Write-Host "Remediation complete: federated credential restored and pods restarted."
