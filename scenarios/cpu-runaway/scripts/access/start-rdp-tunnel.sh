#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabcpurunaway"
VM_NAME="srelabcpurunaway-vm01"
BASTION_NAME="srelabcpurunaway-bas"
LOCAL_PORT=13389
VM_USER="azureuser"

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -b|--bastion-name) BASTION_NAME="$2"; shift 2 ;;
    -p|--local-port) LOCAL_PORT="$2"; shift 2 ;;
    -u|--vm-user) VM_USER="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>] [--bastion-name <b>] [--local-port <port>] [--vm-user <user>]"
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

echo "Starting Bastion RDP tunnel: localhost:$LOCAL_PORT -> $VM_NAME:3389"
echo "Then connect with an RDP client to 127.0.0.1:$LOCAL_PORT"
echo "Username: $VM_USER"

az network bastion tunnel \
  --name "$BASTION_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --target-resource-id "$VM_ID" \
  --resource-port 3389 \
  --port "$LOCAL_PORT"
