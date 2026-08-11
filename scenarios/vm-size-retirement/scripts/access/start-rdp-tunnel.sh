#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabretirement"
VM_NAME="srelabretirement-vm01"
BASTION_NAME="srelabretirement-bas"
LOCAL_PORT=13389

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -b|--bastion-name) BASTION_NAME="$2"; shift 2 ;;
    -p|--local-port) LOCAL_PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>] [--bastion-name <name>] [--local-port <port>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
VM_ID=$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query id -o tsv) || true
if [ -z "$VM_ID" ]; then
  echo "Unable to resolve VM resource ID." >&2
  exit 1
fi

echo "Starting Bastion RDP tunnel: localhost:$LOCAL_PORT -> $VM_NAME:3389"
az network bastion tunnel \
  --name "$BASTION_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --target-resource-id "$VM_ID" \
  --resource-port 3389 \
  --port "$LOCAL_PORT"
