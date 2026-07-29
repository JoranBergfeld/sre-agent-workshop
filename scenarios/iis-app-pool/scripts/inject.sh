#!/usr/bin/env bash
# Scenario 2 — IIS App Pool Failure. Stops a target IIS application pool to
# simulate a stopped backend; the scenario alert + agent flow take it from there.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RESOURCE_GROUP="rg-srelabiisapppool"
VM_NAME="srelabiisapppool-vm01"
APP_POOL_NAME="DefaultAppPool"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -a|--app-pool-name) APP_POOL_NAME="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>] [--app-pool-name <name>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT="Import-Module WebAdministration
Stop-WebAppPool -Name '$APP_POOL_NAME'
Write-Output 'Stopped app pool $APP_POOL_NAME'"

"$SCRIPT_DIR/../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
