# CPU Runaway scenario. Starts one controlled CPU worker per logical processor
# (at least two) so a Standard_B2s VM reliably exceeds the alert threshold.
param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01"
)

$script = @'
$scenarioDirectory = 'C:\SreCpuRunaway'
$workerScriptPath = Join-Path $scenarioDirectory 'cpu-runaway-worker.ps1'
$statePath = Join-Path $scenarioDirectory 'cpu-runaway-state.json'
$marker = 'sre-cpu-runaway-v1'

New-Item -Path $scenarioDirectory -ItemType Directory -Force | Out-Null

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object {
    $_.CommandLine -like "*$workerScriptPath*" -and
    $_.CommandLine -like "*$marker*"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$workerScript = @"
param([Parameter(Mandatory = $true)][string]$Marker)
while ($true) {
  [System.Threading.Thread]::SpinWait(50000000)
}
"@
Set-Content -Path $workerScriptPath -Value $workerScript -Encoding ASCII

$workerCount = [Math]::Max(2, [Environment]::ProcessorCount)
$workers = @(
  for ($index = 1; $index -le $workerCount; $index++) {
    $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$workerScriptPath`" -Marker $marker"
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
  }
)

[pscustomobject]@{
  Marker = $marker
  WorkerScriptPath = $workerScriptPath
  Pids = @($workers | ForEach-Object { $_.Id })
} | ConvertTo-Json -Compress | Set-Content -Path $statePath -Encoding ASCII

Write-Output ("Started {0} sustained CPU workers with marker {1}" -f $workers.Count, $marker)
'@

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
