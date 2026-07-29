# Scenario 2 — IIS App Pool Failure. Stops a target IIS application pool to
# simulate a stopped backend; the scenario alert + agent flow take it from there.
param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisapppool-vm01",
    [string]$AppPoolName = "DefaultAppPool"
)

$script = @"
Import-Module WebAdministration
Stop-WebAppPool -Name '$AppPoolName'
Write-Output 'Stopped app pool $AppPoolName'
"@

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
