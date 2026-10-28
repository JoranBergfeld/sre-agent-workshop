#!/usr/bin/env bash
# Invoke a PowerShell payload on an Azure Arc-enabled server.
#
# `az connectedmachine run-command create` is synchronous and requires
# --location; it returns the terminal instanceView directly, so no polling is
# needed. The command resource is always deleted afterwards.
set -euo pipefail

RESOURCE_GROUP=""
MACHINE_NAME=""
SCRIPT=""
LOCATION=""
COMMAND_NAME="arc-disk-pressure-$(date -u +%Y%m%d%H%M%S)-$$"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -m|--machine-name) MACHINE_NAME="$2"; shift 2 ;;
    -s|--script) SCRIPT="$2"; shift 2 ;;
    -l|--location) LOCATION="$2"; shift 2 ;;
    --command-name) COMMAND_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --resource-group <rg> --machine-name <arc-machine> --script <powershell-script> [--location <region>] [--command-name <name>]"
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

# The run command resource must be created in the Arc machine's own region.
if [ -z "$LOCATION" ]; then
  LOCATION=$(az connectedmachine show \
    --resource-group "$RESOURCE_GROUP" \
    --machine-name "$MACHINE_NAME" \
    --query location -o tsv) || {
    echo "Unable to resolve the location of Arc-enabled server '$MACHINE_NAME'." >&2
    exit 1
  }
fi

cleanup_command() {
  az connectedmachine run-command delete \
    --resource-group "$RESOURCE_GROUP" \
    --machine-name "$MACHINE_NAME" \
    --run-command-name "$COMMAND_NAME" \
    --no-wait \
    --yes >/dev/null 2>&1 || true
}
trap cleanup_command EXIT

result=$(az connectedmachine run-command create \
  --resource-group "$RESOURCE_GROUP" \
  --machine-name "$MACHINE_NAME" \
  --run-command-name "$COMMAND_NAME" \
  --location "$LOCATION" \
  --script "$SCRIPT" \
  -o json) || {
  echo "Failed to create Arc Run Command '$COMMAND_NAME'." >&2
  exit 1
}

state=$(printf '%s' "$result" | jq -r '.instanceView.executionState // "Unknown"')
exit_code=$(printf '%s' "$result" | jq -r '.instanceView.exitCode // 0')
output=$(printf '%s' "$result" | jq -r '.instanceView.output // ""')
error=$(printf '%s' "$result" | jq -r '.instanceView.error // ""')

[ -z "$output" ] || printf '%s\n' "$output"

case "$state" in
  Succeeded|succeeded|success)
    if [ "$exit_code" != "0" ] || [ -n "$error" ]; then
      echo "Arc Run Command $COMMAND_NAME exited with code $exit_code: $error" >&2
      exit 1
    fi
    echo "Arc Run Command $COMMAND_NAME completed."
    ;;
  *)
    echo "Arc Run Command $COMMAND_NAME returned state: $state ${error:+($error)}" >&2
    exit 1
    ;;
esac
