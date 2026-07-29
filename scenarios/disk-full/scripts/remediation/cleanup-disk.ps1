# Surgical disk remediation. Stops the diskfill process and removes only the
# scenario's artifacts under C:\Temp\diskfill — narrower scope than cleanup-temp.
param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$script = @'
if (Test-Path 'C:\Temp\diskfill.pid') {
  $workloadPid = Get-Content -Path 'C:\Temp\diskfill.pid' -ErrorAction SilentlyContinue
  if ($workloadPid) { Stop-Process -Id $workloadPid -Force -ErrorAction SilentlyContinue }
  Remove-Item 'C:\Temp\diskfill.pid' -Force -ErrorAction SilentlyContinue
}
Remove-Item 'C:\Temp\diskfill\*' -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Temp\diskfill.complete' -Force -ErrorAction SilentlyContinue
Write-Output 'Disk cleanup attempted (C:\Temp\diskfill artifacts and fill loop process)'
'@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
