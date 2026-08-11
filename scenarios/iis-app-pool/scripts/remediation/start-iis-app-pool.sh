#!/usr/bin/env bash
# Restarts an IIS application pool — paired with stop-iis-app-pool.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RESOURCE_GROUP="rg-srelabiisapppool"
VM_NAME="srelabiisa-01"
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
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
SCRIPT="Import-Module WebAdministration
Start-WebAppPool -Name '$APP_POOL_NAME'
Write-Output 'Started app pool $APP_POOL_NAME'"

"$SCRIPT_DIR/../../tools/invoke-vm-run-command.sh" \
  --resource-group "$RESOURCE_GROUP" \
  --vm-name "$VM_NAME" \
  --script "$SCRIPT"
