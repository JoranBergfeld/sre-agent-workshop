#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelab", [string]$Workload = "srelab", [string]$Namespace = "workshop", [string]$Deployment = "web-app")
$ErrorActionPreference = 'Stop'
$fedCred = "$Workload-fed-cred"
$identity = "$Workload-id"
$subject = "system:serviceaccount:workshop:workshop-app"
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
