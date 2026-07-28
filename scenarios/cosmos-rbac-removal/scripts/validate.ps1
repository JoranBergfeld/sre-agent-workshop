#!/usr/bin/env pwsh
param([string]$Service = "web-app", [string]$Namespace = "workshop")
$ErrorActionPreference = 'Stop'
$ip = kubectl get svc $Service -n $Namespace -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
if (-not $ip) { throw "No external IP yet for svc/$Service" }
try { $resp = Invoke-WebRequest -Uri "http://$ip/items" -UseBasicParsing; $code = $resp.StatusCode }
catch { $code = $_.Exception.Response.StatusCode.value__ }
Write-Host "GET http://$ip/items -> $code"
if ($code -eq 200) { Write-Host "Healthy: /items returns 200"; exit 0 }
Write-Error "Degraded: /items did not return 200"; exit 1
