#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scenarios/iis-app-pool/scripts/access/start-bastion-tunnel.sh rg-srelabiisapppool srelabiisapppool-bas srelabiisapppool-vm01 3389 13389 azureuser
#   ./scenarios/iis-app-pool/scripts/access/start-bastion-tunnel.sh rg-srelabiisapppool srelabiisapppool-bas srelabiisapppool-vm01 80 18080 azureuser

RESOURCE_GROUP="${1:-rg-srelabiisapppool}"
BASTION_NAME="${2:-srelabiisapppool-bas}"
VM_NAME="${3:-srelabiisapppool-vm01}"
RESOURCE_PORT="${4:-3389}"
LOCAL_PORT="${5:-13389}"
VM_USER="${6:-azureuser}"

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
