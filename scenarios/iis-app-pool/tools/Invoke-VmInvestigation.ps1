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
$inspectionStopped = $false
$inspectionContradictory = $false

if ($WorkspaceId) {
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
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

$inspectionOutput = $null
try {
    $inspectionScript = @"
Import-Module WebAdministration
Get-WebAppPoolState -Name 'DefaultAppPool' | Select-Object Name, Value | ConvertTo-Json -Compress
"@
    $inspectionOutput = @(& "$PSScriptRoot\Invoke-VmRunCommand.ps1" `
        -ResourceGroup $ResourceGroup `
        -VmName $VmName `
        -Script $inspectionScript)
}
catch {
    Write-Stage "InspectVM" "VM inspection failed; the app-pool state remains unconfirmed."
}

if ($null -ne $inspectionOutput) {
    try {
        $inspectionPayload = ($inspectionOutput -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
        $valueProperty = $inspectionPayload.PSObject.Properties['Value']
        if ($null -eq $valueProperty -or -not ($valueProperty.Value -is [string])) {
            Write-Stage "InspectVM" "VM inspection output is unparseable; the stopped app-pool hypothesis is unconfirmed."
        } elseif ($valueProperty.Value -ceq "Stopped") {
            $inspectionStopped = $true
            Write-Stage "InspectVM" "VM inspection emitted Value exactly 'Stopped'."
        } else {
            $inspectionContradictory = $true
            Write-Stage "InspectVM" "VM inspection emitted Value '$($valueProperty.Value)', contradicting the stopped app-pool hypothesis."
        }
    }
    catch {
        Write-Stage "InspectVM" "VM inspection output is unparseable; the stopped app-pool hypothesis is unconfirmed."
    }
}

if ($telemetryConfirmed -and $inspectionStopped) {
    $confidence = "high"
    Write-Stage "Hypothesis" "Telemetry and VM inspection support a stopped IIS app pool."
} elseif ($inspectionContradictory) {
    $confidence = "low"
    Write-Stage "Hypothesis" "VM inspection contradicts a stopped IIS app pool."
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
