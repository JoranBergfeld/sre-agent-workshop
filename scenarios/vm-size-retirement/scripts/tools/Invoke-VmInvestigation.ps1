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
$result = az graph query -q $query -o json
if ($LASTEXITCODE -ne 0) {
    Write-Stage "Correlate" "Resource Graph query failed; retain the advisory and CLI error as evidence."
    throw "Azure Resource Graph query failed."
}

Write-Stage "Correlate" "Resource Graph returned the affected VM inventory."
Write-Output $result
Write-Stage "Hypothesis" "Dv2/DSv2 VMs must be resized before the retirement date."
Write-Stage "Propose" "Prepare one issue assigned to @copilot for the controlled migration plan."
Write-Stage "AwaitApproval" "A human reviews the Copilot pull request and controls deployment."
Write-Stage "Fallback" "If the GitOps route is unavailable, use the local approval gate with a CHG/INC ticket."

@"
# VM Size Retirement Investigation

- **Resource group:** $ResourceGroup
- **Query:** investigation/query.kql
- **Trace:** $(Split-Path $tracePath -Leaf)

## Proposed recovery

Create one issue assigned to @copilot with the affected VM inventory and
deadline. A human reviews the Copilot pull request, merges it, and controls the
deployment. Direct resizing is an approved manual fallback only.
"@ | Set-Content -Path $postmortemPath

Write-Host "Investigation trace: $tracePath"
Write-Host "Postmortem: $postmortemPath"
