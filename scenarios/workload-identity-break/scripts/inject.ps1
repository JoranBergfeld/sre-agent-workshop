#!/usr/bin/env pwsh
param([string]$ResourceGroup = "rg-srelab", [string]$Workload = "srelab", [string]$Namespace = "workshop", [string]$Deployment = "web-app")
$ErrorActionPreference = 'Stop'
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
