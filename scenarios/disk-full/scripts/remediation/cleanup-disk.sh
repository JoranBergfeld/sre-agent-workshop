#!/usr/bin/env bash
# Surgical disk remediation. Stops the diskfill process and removes only the
# scenario's artifacts under C:\Temp\diskfill — narrower scope than cleanup-temp.
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
if (Test-Path 'C:\Temp\diskfill.pid') {
  $workloadPid = Get-Content -Path 'C:\Temp\diskfill.pid' -ErrorAction SilentlyContinue
  if ($workloadPid) { Stop-Process -Id $workloadPid -Force -ErrorAction SilentlyContinue }
  Remove-Item 'C:\Temp\diskfill.pid' -Force -ErrorAction SilentlyContinue
}
Remove-Item 'C:\Temp\diskfill\*' -Force -ErrorAction SilentlyContinue
Remove-Item 'C:\Temp\diskfill.complete' -Force -ErrorAction SilentlyContinue
Write-Output 'Disk cleanup attempted (C:\Temp\diskfill artifacts and fill loop process)'
PWSH
)

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
