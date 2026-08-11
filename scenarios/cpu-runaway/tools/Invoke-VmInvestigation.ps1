# Visible reasoning chain for the CPU Runaway scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
param(
    [string]$WorkspaceId,
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01",
    [string]$ComputerName = "srecpu01"
)

$queryFile = Join-Path $PSScriptRoot "..\investigation\query.kql"
if (-not (Test-Path $queryFile)) {
    throw "CPU Runaway query file is missing: $queryFile"
}

if (-not (Test-Path "$PSScriptRoot\..\output")) {
    New-Item -Path "$PSScriptRoot\..\output" -ItemType Directory | Out-Null
}

$tracePath = "$PSScriptRoot\..\output\investigation-trace-cpu-runaway-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$postmortemPath = "$PSScriptRoot\..\output\postmortem-cpu-runaway-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"

function Write-Stage {
    param([string]$Stage, [string]$Message)
    $line = "[{0}] {1}: {2}" -f (Get-Date -Format "u"), $Stage, $Message
    Write-Host $line
    Add-Content -Path $tracePath -Value $line
}

Write-Stage "Observe" "Received CPU Runaway alert on VM '$VmName' (Windows computer '$ComputerName')."
Write-Stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

$kql = (Get-Content $queryFile -Raw).Replace('{{VM_NAME}}', $ComputerName)

if ($WorkspaceId) {
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
    $queryResult = az monitor log-analytics query -w $WorkspaceId --analytics-query $kql -o json 2>$null
    if ($LASTEXITCODE -eq 0 -and $queryResult) {
        Write-Stage "Correlate" "Telemetry query returned matching records."
    } else {
        Write-Stage "Correlate" "No telemetry records returned yet; continuing with VM inspection evidence."
    }
} else {
    Write-Stage "Correlate" "WorkspaceId not provided; skipping KQL query."
}

Write-Stage "Hypothesis" "The CPU saturation symptom matches the expected runaway process failure mode."
$confidence = "high"
Write-Stage "Propose" "Prepared the approved stop-cpu-runaway action with confidence: $confidence."
Write-Stage "AwaitApproval" "An authorized human must provide a CHG/INC ticket and exact APPROVE confirmation."
Write-Stage "Execute" "The approval gate runs the scenario-owned remediation and records an audit entry."
Write-Stage "Validate" "Run the scenario validation script after approved remediation to confirm service health."
Write-Stage "Postmortem" "Generating markdown postmortem artifact."

$postmortem = @"
# CPU Runaway Scenario Postmortem

- **Scenario:** cpu-runaway
- **Resource Group:** $ResourceGroup
- **VM Resource:** $VmName
- **Windows Computer:** $ComputerName
- **Confidence:** $confidence
- **Trace file:** $(Split-Path $tracePath -Leaf)

## Investigation Timeline

See $(Split-Path $tracePath -Leaf) for the stage-by-stage reasoning chain:

Observe → Investigate → Correlate → Hypothesis → Propose remediation → Await approval → Execute through gate → Validate → Postmortem

## Proposed Remediation

Use the constrained remediation wrapper as the normal approved remediation path:

~~~powershell
.\scenarios\cpu-runaway\tools\Invoke-ApprovedRemediation.ps1 -Action stop-cpu-runaway -ResourceGroup $ResourceGroup -VmName $VmName -ChangeTicket CHG-12345
~~~
"@

Set-Content -Path $postmortemPath -Value $postmortem
Write-Host "Investigation trace: $tracePath"
Write-Host "Postmortem: $postmortemPath"
