#!/usr/bin/env bash
set -euo pipefail

WORKLOAD="srelabretirement"
RESOURCE_GROUP="rg-${WORKLOAD}"
RESOURCE_GROUP_SET=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    -w|--workload)
      WORKLOAD="$2"
      if [ "$RESOURCE_GROUP_SET" = false ]; then RESOURCE_GROUP="rg-${WORKLOAD}"; fi
      shift 2
      ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; RESOURCE_GROUP_SET=true; shift 2 ;;
    -h|--help) echo "Usage: $0 [--workload <name>] [--resource-group <rg>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
FILTER="[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
REMAINING=$(az vm list --resource-group "$RESOURCE_GROUP" --query "$FILTER" -o tsv)

if [ -n "$(printf '%s' "$REMAINING" | tr -d '[:space:]')" ]; then
  echo "FAIL: VMs still on a retiring size:" >&2
  printf '%s\n' "$REMAINING" >&2
  exit 1
fi

echo "PASS: no VMs on a retiring size in $RESOURCE_GROUP."
