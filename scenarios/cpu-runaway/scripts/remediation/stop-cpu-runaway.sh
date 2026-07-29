#!/usr/bin/env bash
# Stops only CPU workers that carry this scenario's exact path and marker.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RESOURCE_GROUP="rg-srelabcpurunaway"
VM_NAME="srelabcpurunaway-vm01"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT=$(cat <<'PWSH'
$scenarioDirectory = 'C:\SreCpuRunaway'
$workerScriptPath = Join-Path $scenarioDirectory 'cpu-runaway-worker.ps1'
$statePath = Join-Path $scenarioDirectory 'cpu-runaway-state.json'
$marker = 'sre-cpu-runaway-v1'
$workerPids = @()

if (Test-Path $statePath) {
  try {
    $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($state.Marker -eq $marker -and $state.WorkerScriptPath -eq $workerScriptPath) {
      $workerPids = @($state.Pids)
    }
  } catch {
    Write-Warning "Ignoring unreadable CPU Runaway state file."
  }
}

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object {
    $_.CommandLine -like "*$workerScriptPath*" -and
    $_.CommandLine -like "*$marker*"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($workerPid in $workerPids) {
  $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid" -ErrorAction SilentlyContinue
  if ($worker -and $worker.CommandLine -like "*$workerScriptPath*" -and $worker.CommandLine -like "*$marker*") {
    Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Remove-Item -Path $statePath, $workerScriptPath -Force -ErrorAction SilentlyContinue
Write-Output 'Stopped only CPU Runaway worker processes'
PWSH
)

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
