param(
    [string]$ResourceGroup = "rg-srelabretirement"
)

$ErrorActionPreference = 'Stop'
$queryPath = Join-Path $PSScriptRoot '..\..\investigation\query.kql'
$outputDirectory = Join-Path $PSScriptRoot '..\..\output'

if (-not (Test-Path $queryPath)) {
    throw "Local investigation query is missing: $queryPath"
}

New-Item -Path $outputDirectory -ItemType Directory -Force | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$tracePath = Join-Path $outputDirectory "investigation-trace-$timestamp.log"
$postmortemPath = Join-Path $outputDirectory "postmortem-$timestamp.md"
$query = (Get-Content $queryPath -Raw).Replace('{{RESOURCE_GROUP}}', $ResourceGroup)

function Write-Stage {
    param([string]$Name, [string]$Message)
    $line = "[$((Get-Date).ToUniversalTime().ToString('o'))] ${Name}: $Message"
    Write-Host $line
    Add-Content -Path $tracePath -Value $line
}

Write-Stage "Observe" "Received VM size retirement advisory for resource group '$ResourceGroup'."
Write-Stage "Investigate" "Running the capsule's Azure Resource Graph query."
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$result = az graph query -q $query -o json
if ($LASTEXITCODE -ne 0) {
    Write-Stage "Correlate" "Resource Graph query failed; retain the advisory and CLI error as evidence."
    throw "Azure Resource Graph query failed."
}

Write-Stage "Correlate" "Resource Graph returned the affected VM inventory."
Write-Output $result
Write-Stage "Hypothesis" "Dv2/DSv2 VMs must be resized before the retirement date."
Write-Stage "Propose" "Prepared the approval-gated migrate-vm-size action for the affected fleet."
Write-Stage "AwaitApproval" "An authorized operator must provide a CHG/INC ticket and type exact APPROVE."
Write-Stage "Execute" "Use the local approval gate; the SRE Agent does not execute remediation."

@"
# VM Size Retirement Investigation

- **Resource group:** $ResourceGroup
- **Query:** investigation/query.kql
- **Trace:** $(Split-Path $tracePath -Leaf)

## Proposed recovery

An authorized operator reviews the affected VM inventory and deadline, then
uses the approval gate with a valid CHG/INC ticket and exact APPROVE response.
The gate audits the fleet migration; the SRE Agent does not execute it.
"@ | Set-Content -Path $postmortemPath

Write-Host "Investigation trace: $tracePath"
Write-Host "Postmortem: $postmortemPath"
