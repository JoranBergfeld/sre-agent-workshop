#!/usr/bin/env bash
# Stops the sustained CPU workload — by recorded PID and as a fallback by
# matching the cpu-runaway.ps1 command line.
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
PWSH
)

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
