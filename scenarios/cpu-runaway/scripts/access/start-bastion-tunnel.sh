#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scenarios/cpu-runaway/scripts/access/start-bastion-tunnel.sh rg-srelabcpurunaway srelabcpurunaway-bas srelabcpurunaway-vm01 3389 13389 azureuser
#   ./scenarios/cpu-runaway/scripts/access/start-bastion-tunnel.sh rg-srelabcpurunaway srelabcpurunaway-bas srelabcpurunaway-vm01 80 18080 azureuser

RESOURCE_GROUP="${1:-rg-srelabcpurunaway}"
BASTION_NAME="${2:-srelabcpurunaway-bas}"
VM_NAME="${3:-srelabcpurunaway-vm01}"
RESOURCE_PORT="${4:-3389}"
LOCAL_PORT="${5:-13389}"
VM_USER="${6:-azureuser}"

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
VM_ID="$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query id -o tsv)"

echo "Opening Bastion tunnel: localhost:${LOCAL_PORT} -> ${VM_NAME}:${RESOURCE_PORT}"
echo "Resource group: ${RESOURCE_GROUP}"
echo "Bastion:        ${BASTION_NAME}"
echo "VM user:        ${VM_USER}"
if [ "$RESOURCE_PORT" = "3389" ]; then
  echo "RDP target:     127.0.0.1:${LOCAL_PORT} (username: ${VM_USER})"
fi

az network bastion tunnel \
  --name "$BASTION_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --target-resource-id "$VM_ID" \
  --resource-port "$RESOURCE_PORT" \
  --port "$LOCAL_PORT"
