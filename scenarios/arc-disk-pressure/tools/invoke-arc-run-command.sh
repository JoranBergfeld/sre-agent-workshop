#!/usr/bin/env bash
# Invoke a PowerShell payload on an Azure Arc-enabled server.
set -euo pipefail

RESOURCE_GROUP=""
MACHINE_NAME=""
SCRIPT=""
COMMAND_NAME="arc-disk-pressure-$(date -u +%Y%m%d%H%M%S)-$$"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -m|--machine-name) MACHINE_NAME="$2"; shift 2 ;;
    -s|--script) SCRIPT="$2"; shift 2 ;;
    --command-name) COMMAND_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --resource-group <rg> --machine-name <arc-machine> --script <powershell-script> [--command-name <name>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$RESOURCE_GROUP" ] && [ -n "$MACHINE_NAME" ] && [ -n "$SCRIPT" ] || {
  echo "resource group, machine name, and script are required" >&2
  exit 2
}

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ]; then
  az account set --subscription "$requested_subscription_id"
fi
az account show >/dev/null || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }

cleanup_command() {
  az connectedmachine run-command delete \
    --resource-group "$RESOURCE_GROUP" \
    --machine-name "$MACHINE_NAME" \
    --run-command-name "$COMMAND_NAME" \
    --yes >/dev/null 2>&1 || true
}
trap cleanup_command EXIT

az connectedmachine run-command create \
  --resource-group "$RESOURCE_GROUP" \
  --machine-name "$MACHINE_NAME" \
  --run-command-name "$COMMAND_NAME" \
  --script "$SCRIPT" >/dev/null

status=""
for attempt in $(seq 1 24); do
  status=$(az connectedmachine run-command show \
    --resource-group "$RESOURCE_GROUP" \
    --machine-name "$MACHINE_NAME" \
    --run-command-name "$COMMAND_NAME" \
    --query properties.instanceView.executionState \
    --output tsv 2>/dev/null || true)
  case "$status" in
    Succeeded|success|succeeded) echo "Arc Run Command $COMMAND_NAME completed."; break ;;
    Failed|failed|Canceled|canceled) echo "Arc Run Command $COMMAND_NAME returned state: $status" >&2; exit 1 ;;
  esac
  if [ "$attempt" -eq 24 ]; then echo "Arc Run Command $COMMAND_NAME timed out." >&2; exit 1; fi
  sleep 5
done
