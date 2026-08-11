#!/usr/bin/env bash
# CPU Runaway scenario. Starts one controlled CPU worker per logical processor
# (at least two) so a Standard_B2s VM reliably exceeds the alert threshold.
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

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

SCRIPT=$(cat <<'PWSH'
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

$workerScript = @(
  'param([Parameter(Mandatory = $true)][string]$Marker)'
  'while ($true) {'
  '  [System.Threading.Thread]::SpinWait(50000000)'
  '}'
) -join [Environment]::NewLine
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
PWSH
)

"$SCRIPT_DIR/../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
