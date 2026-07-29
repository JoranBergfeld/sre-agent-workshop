# Surgical disk remediation. Stops only a verified diskfill process and removes
# the scenario's artifacts under C:\Temp\diskfill — narrower than cleanup-temp.
param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$script = @'
$pidPath = 'C:\Temp\diskfill.pid'
$ownerPath = 'C:\Temp\diskfill.owner.json'
$markerPath = 'C:\Temp\diskfill.marker'
$ownershipMatches = $false

if ((Test-Path $pidPath) -and (Test-Path $ownerPath)) {
  $pidText = Get-Content -Path $pidPath -Raw -ErrorAction SilentlyContinue
  $owner = Get-Content -Path $ownerPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
  if ($pidText -match '^\s*\d+\s*$' -and $owner) {
    $workloadPid = [int]$pidText.Trim()
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $workloadPid" -ErrorAction SilentlyContinue
    $commandMatches = $process -and $owner.encodedCommand -and $process.CommandLine -match [regex]::Escape([string]$owner.encodedCommand)
    $ownershipMatches = $process -and
      $owner.scenario -eq 'disk-full' -and
      $owner.marker -eq 'sre-agent-workshop/disk-full/v1' -and
      [int]$owner.processId -eq $workloadPid -and
      $owner.processName -eq 'powershell.exe' -and
      $process.Name -match '^powershell(\.exe)?$' -and
      $commandMatches
    if ($ownershipMatches) {
      Stop-Process -Id $workloadPid -Force -ErrorAction Stop
      Write-Output "Stopped owned disk-full fill process PID $workloadPid."
    } elseif ($process) {
      Write-Output "Safe condition: process PID $workloadPid did not match the disk-full ownership record; left process untouched."
    } else {
      Write-Output "Safe condition: disk-full PID $workloadPid is stale; no process was stopped."
    }
  } else {
    Write-Output 'Safe condition: invalid disk-full ownership record; no process was stopped.'
  }
} elseif ((Test-Path $pidPath) -or (Test-Path $ownerPath)) {
  Write-Output 'Safe condition: incomplete disk-full ownership record; no process was stopped.'
} else {
  Write-Output 'Safe condition: no disk-full ownership record found; no process was stopped.'
}

Remove-Item $pidPath, $ownerPath, $markerPath -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Temp\diskfill' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Temp\diskfill.complete' -Force -ErrorAction SilentlyContinue
Write-Output 'Disk cleanup completed (scenario artifacts removed; only verified owned processes are stopped).'
'@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
