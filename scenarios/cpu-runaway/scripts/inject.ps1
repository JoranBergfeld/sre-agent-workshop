# CPU Runaway scenario. Starts a sustained hidden PowerShell workload on
# the VM so CPU pressure stays high until remediation.
param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01"
)

$script = @'
New-Item -Path 'C:\workshop' -ItemType Directory -Force | Out-Null
$cpuScriptPath = 'C:\workshop\cpu-runaway.ps1'
$cpuLoop = 'while ($true) { 1..200000 | ForEach-Object { [Math]::Sqrt($_) | Out-Null } }'
Set-Content -Path $cpuScriptPath -Value $cpuLoop -Encoding ASCII
$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File C:\workshop\cpu-runaway.ps1' -WindowStyle Hidden -PassThru
Set-Content -Path 'C:\workshop\cpu-runaway.pid' -Value $proc.Id -Encoding ASCII
Write-Output ("Started sustained CPU workload with PID {0}" -f $proc.Id)
'@

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
