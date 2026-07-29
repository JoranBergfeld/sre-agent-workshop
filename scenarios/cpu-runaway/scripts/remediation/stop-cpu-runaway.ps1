# Stops the sustained CPU workload — by recorded PID and as a fallback by
# matching the cpu-runaway.ps1 command line.
param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01"
)

$script = @'
if (Test-Path 'C:\workshop\cpu-runaway.pid') {
  $workloadPid = Get-Content -Path 'C:\workshop\cpu-runaway.pid' -ErrorAction SilentlyContinue
  if ($workloadPid) {
    Stop-Process -Id $workloadPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item 'C:\workshop\cpu-runaway.pid' -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*C:\workshop\cpu-runaway.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Output 'Stopped sustained CPU workload processes'
'@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
