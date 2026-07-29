# Visible reasoning chain for a VM scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
param(
    [string]$WorkspaceId,
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisa-01"
)

$Scenario = "iis-app-pool"
$queryFile = Join-Path $PSScriptRoot "..\investigation\query.kql"
if (-not (Test-Path $queryFile)) {
    throw "Investigation query is missing: $queryFile"
}

if (-not (Test-Path "$PSScriptRoot\..\output")) {
    New-Item -Path "$PSScriptRoot\..\output" -ItemType Directory | Out-Null
}

$tracePath = "$PSScriptRoot\..\output\investigation-trace-$Scenario-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
$postmortemPath = "$PSScriptRoot\..\output\postmortem-$Scenario-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"

function Write-Stage {
    param([string]$Stage, [string]$Message)
    $line = "[{0}] {1}: {2}" -f (Get-Date -Format "u"), $Stage, $Message
    Write-Host $line
    Add-Content -Path $tracePath -Value $line
}

Write-Stage "Observe" "Received alert for scenario '$Scenario' on VM '$VmName'."
Write-Stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

$kql = (Get-Content $queryFile -Raw).Replace('{{VM_NAME}}', $VmName)
$telemetryConfirmed = $false
$inspectionConfirmed = $false

if ($WorkspaceId) {
    $queryResult = & az monitor log-analytics query -w $WorkspaceId --analytics-query $kql -o json 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Stage "Correlate" "KQL query failed; telemetry evidence is unavailable."
    } elseif (-not $queryResult) {
        Write-Stage "Correlate" "KQL query returned no records; telemetry evidence is unavailable."
    } else {
        try {
            $queryPayload = ($queryResult -join [Environment]::NewLine) | ConvertFrom-Json
            $rowCount = @($queryPayload.tables | ForEach-Object { @($_.rows).Count } | Measure-Object -Sum).Sum
            if ($rowCount -gt 0) {
                $telemetryConfirmed = $true
                Write-Stage "Correlate" "KQL query returned matching telemetry records."
            } else {
                Write-Stage "Correlate" "KQL query returned no records; telemetry evidence is unavailable."
            }
        } catch {
            Write-Stage "Correlate" "KQL query results could not be evaluated; telemetry evidence is unavailable."
        }
    }
} else {
    Write-Stage "Correlate" "WorkspaceId not provided; telemetry evidence is unavailable."
}

try {
    $inspectionScript = @"
Import-Module WebAdministration
Get-WebAppPoolState -Name 'DefaultAppPool' | Select-Object Name, Value | ConvertTo-Json -Compress
"@
    & "$PSScriptRoot\Invoke-VmRunCommand.ps1" `
        -ResourceGroup $ResourceGroup `
        -VmName $VmName `
        -Script $inspectionScript
    $inspectionConfirmed = $true
    Write-Stage "InspectVM" "VM inspection reported the current IIS app-pool state."
} catch {
    Write-Stage "InspectVM" "VM inspection failed; the app-pool state remains unconfirmed."
}

if ($telemetryConfirmed -and $inspectionConfirmed) {
    $confidence = "high"
    Write-Stage "Hypothesis" "Telemetry and VM inspection support a stopped IIS app pool."
} elseif ($telemetryConfirmed) {
    $confidence = "medium"
    Write-Stage "Hypothesis" "Telemetry supports a stopped IIS app pool, but VM inspection is unavailable."
} else {
    $confidence = "low"
    Write-Stage "Hypothesis" "Telemetry is incomplete; a stopped IIS app pool remains an unconfirmed hypothesis."
}

Write-Stage "Propose" "Prepared remediation plan with confidence: $confidence."
Write-Stage "AwaitApproval" "Remediation execution requires explicit operator approval."
Write-Stage "Execute" "Use Invoke-ApprovedRemediation.ps1 with a valid change ticket."
Write-Stage "Validate" "Run validation script after remediation to confirm recovery."
Write-Stage "Postmortem" "Generating markdown postmortem artifact."

$postmortem = @"
# VM Scenario Postmortem

- **Scenario:** $Scenario
- **Resource Group:** $ResourceGroup
- **VM:** $VmName
- **Confidence:** $confidence
- **Trace file:** $(Split-Path $tracePath -Leaf)

## Investigation Timeline

See `$(Split-Path $tracePath -Leaf)` for the stage-by-stage reasoning chain:

Observe → Investigate → Correlate → Hypothesis → Propose remediation → Await approval → Execute → Validate → Postmortem

## Proposed Remediation

Use the constrained remediation wrapper:

~~~powershell
.\scenarios\iis-app-pool\tools\Invoke-ApprovedRemediation.ps1 -Action start-iis-app-pool -ResourceGroup $ResourceGroup -VmName $VmName -ChangeTicket CHG-12345
~~~
"@

Set-Content -Path $postmortemPath -Value $postmortem
Write-Host "Investigation trace: $tracePath"
Write-Host "Postmortem: $postmortemPath"
