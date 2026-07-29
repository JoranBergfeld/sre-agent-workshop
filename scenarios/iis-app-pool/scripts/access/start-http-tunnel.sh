#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabiisapppool"
VM_NAME="srelabiisapppool-vm01"
BASTION_NAME="srelabiisapppool-bas"
LOCAL_PORT=18080

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -b|--bastion-name) BASTION_NAME="$2"; shift 2 ;;
    -p|--local-port) LOCAL_PORT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>] [--bastion-name <b>] [--local-port <port>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

VM_ID=$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query "id" -o tsv) || true
if [ -z "${VM_ID:-}" ]; then
  echo "Unable to resolve VM resource ID." >&2
  exit 1
fi

echo "Starting Bastion HTTP tunnel: localhost:$LOCAL_PORT -> $VM_NAME:80"
az network bastion tunnel \
  --name "$BASTION_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --target-resource-id "$VM_ID" \
  --resource-port 80 \
  --port "$LOCAL_PORT"
