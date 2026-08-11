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
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
LOOP_COMMAND=$(cat <<'PWSH'
New-Item -Path "C:\Temp\diskfill" -ItemType Directory -Force | Out-Null
$scenarioMarker = 'sre-agent-workshop/disk-full/v1'
$pidPath = 'C:\Temp\diskfill.pid'
$markerPath = 'C:\Temp\diskfill.marker'
$i = 0
$chunkBytes = 1GB
try {
  Set-Content -Path $markerPath -Value $scenarioMarker -Encoding ASCII
  while ($true) {
    $filePath = ("C:\Temp\diskfill\fill-{0:D5}.bin" -f $i)
    fsutil file createnew $filePath $chunkBytes | Out-Null
    if ($LASTEXITCODE -ne 0) { break }
    $i++
  }
  Set-Content -Path "C:\Temp\diskfill.complete" -Value ("Created {0}x1GB files in C:\Temp\diskfill" -f $i) -Encoding ASCII
} finally {
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
}
PWSH
)

ENCODED_LOOP=$(printf '%s' "$LOOP_COMMAND" | iconv -f UTF-8 -t UTF-16LE | base64 -w 0)

SCRIPT="New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null; \$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $ENCODED_LOOP' -WindowStyle Hidden -PassThru; \$owner = [PSCustomObject]@{ scenario = 'disk-full'; marker = 'sre-agent-workshop/disk-full/v1'; processId = \$proc.Id; processName = 'powershell.exe'; encodedCommand = '$ENCODED_LOOP' }; \$owner | ConvertTo-Json -Compress | Set-Content -Path 'C:\Temp\diskfill.owner.json' -Encoding ASCII; Set-Content -Path 'C:\Temp\diskfill.pid' -Value \$proc.Id -Encoding ASCII; Write-Output ('Started owned disk-full fill loop in C:\Temp with PID {0}' -f \$proc.Id)"

"$SCRIPT_DIR/../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
