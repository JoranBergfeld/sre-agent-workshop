#!/usr/bin/env bash
# Broad Temp remediation. Stops the diskfill process if present and clears
# everything under C:\Temp — useful when the agent isn't allowed to delete
# arbitrary paths but can trigger an approved Temp-folder cleanup.
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
  if ($workloadPid) {
    Stop-Process -Id $workloadPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item 'C:\Temp\diskfill.pid' -Force -ErrorAction SilentlyContinue
}

$removed = 0
$failed = 0
Get-ChildItem -Path 'C:\Temp' -Force -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction Stop
    $removed++
  } catch {
    $failed++
  }
}

Write-Output ("Temp cleanup completed: path=C:\Temp removed={0} failed={1}" -f $removed, $failed)
PWSH
)

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
