# Approval-gated manual fallback for this scenario's constrained remediation.
param(
    [Parameter(Mandatory = $true)][string]$Action,
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01",
    [Parameter(Mandatory = $true)][string]$ChangeTicket
)

if ($ChangeTicket -notmatch '^(CHG|INC)-[0-9]+$') {
    throw "ChangeTicket must match CHG-12345 or INC-12345."
}

if ($Action -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
    throw "Action must be a kebab-case remediation action."
}

$scriptPath = Join-Path $PSScriptRoot "..\scripts\remediation\$Action.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "Unknown action '$Action': no approved script at scripts\remediation\$Action.ps1."
}

Write-Host "========================================"
Write-Host "  Approval Gate"
Write-Host "========================================"
Write-Host "Ticket:        $ChangeTicket"
Write-Host "Action:        $Action"
Write-Host "ResourceGroup: $ResourceGroup"
Write-Host "VM:            $VmName"
Write-Host "========================================"
$approval = Read-Host "Type APPROVE to execute"
if ($approval -ne "APPROVE") {
    throw "Remediation canceled. Explicit approval was not granted."
}

& $scriptPath -ResourceGroup $ResourceGroup -VmName $VmName

if (-not (Test-Path "$PSScriptRoot\..\output")) {
    New-Item -Path "$PSScriptRoot\..\output" -ItemType Directory | Out-Null
}

$auditEntry = [PSCustomObject]@{
    timestamp = (Get-Date).ToString("o")
    ticket = $ChangeTicket
    action = $Action
    resourceGroup = $ResourceGroup
    vmName = $VmName
    status = "executed"
}

$auditEntry | ConvertTo-Json -Compress | Add-Content -Path "$PSScriptRoot\..\output\actions-audit.log"
Write-Host "Approved remediation completed and audited."
