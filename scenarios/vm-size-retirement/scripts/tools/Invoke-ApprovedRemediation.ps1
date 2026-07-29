param(
    [Parameter(Mandatory = $true)][string]$Action,
    [string]$ResourceGroup = "rg-srelabretirement",
    [Parameter(Mandatory = $true)][string]$ChangeTicket
)

$ErrorActionPreference = 'Stop'

if ($Action -ne 'migrate-vm-size') {
    throw "Unknown action '$Action'. Only migrate-vm-size is available in this capsule."
}

if ($ChangeTicket -notmatch '^(CHG|INC)-[0-9]+$') {
    throw "ChangeTicket must match CHG-12345 or INC-12345."
}

$scriptPath = Join-Path $PSScriptRoot '..\remediation\migrate-vm-size.ps1'
if (-not (Test-Path $scriptPath)) {
    throw "Approved action script missing: $scriptPath"
}

Write-Host "========================================"
Write-Host "Approval Gate"
Write-Host "Ticket:        $ChangeTicket"
Write-Host "Action:        $Action"
Write-Host "ResourceGroup: $ResourceGroup"
Write-Host "Scope:         all VMs on retiring SKUs"
Write-Host "========================================"
$approval = Read-Host "Type APPROVE to execute"
if ($approval -ne 'APPROVE') {
    throw "Remediation canceled. Explicit approval was not granted."
}

$outputDirectory = if ([string]::IsNullOrWhiteSpace($env:SRE_OUTPUT_DIR)) {
    Join-Path $PSScriptRoot '..\..\output'
} else {
    $env:SRE_OUTPUT_DIR
}
New-Item -Path $outputDirectory -ItemType Directory -Force | Out-Null
$attemptId = "{0}-{1}" -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'), [guid]::NewGuid().ToString('N')
$auditPath = Join-Path $outputDirectory 'actions-audit.log'
$resultPath = Join-Path $outputDirectory ".remediation-$attemptId.result"
$previousResultPath = $env:SRE_REMEDIATION_RESULT_FILE

function Write-Audit {
    param(
        [string]$Status,
        [int]$CompletedVms = 0,
        [string]$FailedVm = $null,
        [int]$ExitCode = 0
    )

    [PSCustomObject]@{
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        attemptId = $attemptId
        ticket = $ChangeTicket
        action = $Action
        resourceGroup = $ResourceGroup
        scope = 'all-retiring-vms'
        status = $Status
        completedVms = $CompletedVms
        failedVm = $FailedVm
        exitCode = $ExitCode
    } | ConvertTo-Json -Compress | Add-Content -Path $auditPath
}

$terminalStatus = 'failed'
$completedVms = 0
$failedVm = $null
$exitCode = 1
$failureMessage = $null
$result = $null

Write-Audit -Status 'approved'
try {
    Write-Audit -Status 'started'
    $env:SRE_REMEDIATION_RESULT_FILE = $resultPath
    & $scriptPath -ResourceGroup $ResourceGroup
    if ($LASTEXITCODE -ne 0) {
        throw "Approved remediation failed with exit code $LASTEXITCODE."
    }
    $terminalStatus = 'succeeded'
    $exitCode = 0
} catch {
    $failureMessage = $_.Exception.Message
    if ($LASTEXITCODE -ne 0) {
        $exitCode = $LASTEXITCODE
    }
} finally {
    if (Test-Path $resultPath) {
        $result = Get-Content -Path $resultPath -Raw | ConvertFrom-Json
        $completedVms = [int]$result.completed
        if (-not [string]::IsNullOrWhiteSpace($result.failedVm)) {
            $failedVm = $result.failedVm
        }
        Remove-Item -Path $resultPath -Force
    }

    if ($terminalStatus -eq 'succeeded' -and $completedVms -eq 0 -and $null -eq $result) {
        $terminalStatus = 'failed'
        $exitCode = 1
        $failureMessage = 'Remediation completed without progress context.'
    }

    Write-Audit -Status $terminalStatus -CompletedVms $completedVms -FailedVm $failedVm -ExitCode $exitCode
    if ($null -eq $previousResultPath) {
        Remove-Item Env:SRE_REMEDIATION_RESULT_FILE -ErrorAction SilentlyContinue
    } else {
        $env:SRE_REMEDIATION_RESULT_FILE = $previousResultPath
    }
}

if ($terminalStatus -ne 'succeeded') {
    throw "Approved remediation failed after completed $completedVms VM(s); failed VM: $($failedVm ?? 'unknown'). $failureMessage"
}

Write-Host "Approved remediation completed and audited."
