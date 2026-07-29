#!/usr/bin/env bash
# Scenario 1 — Disk Full.
# Iteratively fills C:\Temp\diskfill\*.bin with 1GB files until the disk is full,
# so the agent can attribute pressure to the Temp folder during investigation.
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

LOOP_COMMAND=$(cat <<'PWSH'
New-Item -Path "C:\Temp\diskfill" -ItemType Directory -Force | Out-Null
$i = 0
$chunkBytes = 1GB
while ($true) {
  $filePath = ("C:\Temp\diskfill\fill-{0:D5}.bin" -f $i)
  fsutil file createnew $filePath $chunkBytes | Out-Null
  if ($LASTEXITCODE -ne 0) { break }
  $i++
}
Set-Content -Path "C:\Temp\diskfill.complete" -Value ("Created {0}x1GB files in C:\Temp\diskfill" -f $i) -Encoding ASCII
PWSH
)

ENCODED_LOOP=$(printf '%s' "$LOOP_COMMAND" | iconv -f UTF-8 -t UTF-16LE | base64 -w 0)

SCRIPT="New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null; \$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $ENCODED_LOOP' -WindowStyle Hidden -PassThru; Set-Content -Path 'C:\Temp\diskfill.pid' -Value \$proc.Id -Encoding ASCII; Write-Output ('Started iterative disk fill loop in C:\Temp with PID {0}' -f \$proc.Id)"

"$SCRIPT_DIR/../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
