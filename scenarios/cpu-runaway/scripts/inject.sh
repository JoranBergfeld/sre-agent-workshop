#!/usr/bin/env bash
# CPU Runaway scenario. Starts a sustained hidden PowerShell workload on
# the VM so CPU pressure stays high until remediation.
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
New-Item -Path 'C:\workshop' -ItemType Directory -Force | Out-Null
$cpuScriptPath = 'C:\workshop\cpu-runaway.ps1'
$cpuLoop = 'while ($true) { 1..200000 | ForEach-Object { [Math]::Sqrt($_) | Out-Null } }'
Set-Content -Path $cpuScriptPath -Value $cpuLoop -Encoding ASCII
$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File C:\workshop\cpu-runaway.ps1' -WindowStyle Hidden -PassThru
Set-Content -Path 'C:\workshop\cpu-runaway.pid' -Value $proc.Id -Encoding ASCII
Write-Output ("Started sustained CPU workload with PID {0}" -f $proc.Id)
PWSH
)

"$SCRIPT_DIR/../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
