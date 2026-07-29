# Visible reasoning chain for the Disk Full scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
param(
    [string]$WorkspaceId,
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$queryFile = Join-Path $PSScriptRoot "..\investigation\query.kql"
if (-not (Test-Path $queryFile)) {
    throw "Investigation query missing: $queryFile"
}

if (-not (Test-Path "$PSScriptRoot\..\output")) {
    New-Item -Path "$PSScriptRoot\..\output" -ItemType Directory | Out-Null
}

$tracePath = "$PSScriptRoot\..\output\investigation-trace-disk-full-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$postmortemPath = "$PSScriptRoot\..\output\postmortem-disk-full-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"

function Write-Stage {
    param([string]$Stage, [string]$Message)
    $line = "[{0}] {1}: {2}" -f (Get-Date -Format "u"), $Stage, $Message
    Write-Host $line
    Add-Content -Path $tracePath -Value $line
}

Write-Stage "Observe" "Received C: disk-pressure alert on VM '$VmName'."
Write-Stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

$kql = (Get-Content $queryFile -Raw).Replace('{{VM_NAME}}', $VmName)

if ($WorkspaceId) {
    $queryResult = az monitor log-analytics query -w $WorkspaceId --analytics-query $kql -o json 2>$null
    if ($LASTEXITCODE -eq 0 -and $queryResult) {
        Write-Stage "Correlate" "Telemetry query returned matching records."
    } else {
        Write-Stage "Correlate" "No telemetry records returned yet; continuing with VM inspection evidence."
    }
} else {
    Write-Stage "Correlate" "WorkspaceId not provided; skipping KQL query."
}

Write-Stage "Hypothesis" "C:\Temp\diskfill is the likely source of the C: free-space pressure."
$confidence = "high"
Write-Stage "Propose" "Prepared remediation plan with confidence: $confidence."
Write-Stage "AwaitApproval" "Remediation execution requires explicit operator approval."
Write-Stage "Execute" "Use Invoke-ApprovedRemediation.ps1 with a valid change ticket."
Write-Stage "Validate" "Run validation script after remediation to confirm recovery."
Write-Stage "Postmortem" "Generating markdown postmortem artifact."

$postmortem = @"
# Disk Full Scenario Postmortem

- **Scenario:** disk-full
- **Resource Group:** $ResourceGroup
- **VM:** $VmName
- **Confidence:** $confidence
- **Trace file:** $(Split-Path $tracePath -Leaf)

## Investigation Timeline

See `$(Split-Path $tracePath -Leaf)` for the stage-by-stage reasoning chain:

Observe → Investigate → Correlate → Hypothesis → Propose remediation → Await approval → Execute → Validate → Postmortem

## Proposed Remediation

Use the constrained remediation wrapper:

    .\scenarios\disk-full\tools\Invoke-ApprovedRemediation.ps1 -Action cleanup-disk -ResourceGroup $ResourceGroup -VmName $VmName -ChangeTicket CHG-12345
"@

Set-Content -Path $postmortemPath -Value $postmortem
Write-Host "Investigation trace: $tracePath"
Write-Host "Postmortem: $postmortemPath"
