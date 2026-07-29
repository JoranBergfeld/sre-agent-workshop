# Restarts an IIS application pool — paired with stop-iis-app-pool.ps1.
param(
    [string]$ResourceGroup = "rg-srelabiisapppool",
    [string]$VmName = "srelabiisapppool-vm01",
    [string]$AppPoolName = "DefaultAppPool"
)

$script = @"
Import-Module WebAdministration
Start-WebAppPool -Name '$AppPoolName'
Write-Output 'Started app pool $AppPoolName'
"@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
