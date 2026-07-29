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

& $scriptPath -ResourceGroup $ResourceGroup
if ($LASTEXITCODE -ne 0) {
    throw "Approved remediation failed with exit code $LASTEXITCODE."
}

$outputDirectory = if ([string]::IsNullOrWhiteSpace($env:SRE_OUTPUT_DIR)) {
    Join-Path $PSScriptRoot '..\..\output'
} else {
    $env:SRE_OUTPUT_DIR
}
New-Item -Path $outputDirectory -ItemType Directory -Force | Out-Null

[PSCustomObject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString('o')
    ticket = $ChangeTicket
    action = $Action
    resourceGroup = $ResourceGroup
    scope = 'all-retiring-vms'
    status = 'executed'
} | ConvertTo-Json -Compress | Add-Content -Path (Join-Path $outputDirectory 'actions-audit.log')

Write-Host "Approved remediation completed and audited."
