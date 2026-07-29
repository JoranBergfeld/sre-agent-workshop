#!/usr/bin/env bash
# Surgical disk remediation. Stops only a verified diskfill process and removes
# the scenario's artifacts under C:\Temp\diskfill — narrower than cleanup-temp.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RESOURCE_GROUP="rg-srelabdiskfull"
VM_NAME="srelabdiskfull-vm01"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT=$(cat <<'PWSH'
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
PWSH
)

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
