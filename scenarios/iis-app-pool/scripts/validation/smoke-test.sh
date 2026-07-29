#!/usr/bin/env bash
set -uo pipefail

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

echo "========================================"
echo "  IIS App Pool Failure Smoke Test"
echo "========================================"

if ! POWER_STATE=$(az vm get-instance-view --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query "instanceView.statuses[1].displayStatus" -o tsv); then
  echo "Unable to read VM power state." >&2
  exit 1
fi
if [ -z "$POWER_STATE" ]; then
  echo "Unable to read VM power state." >&2
  exit 1
fi
echo "Power state: $POWER_STATE"

if ! VM_ID=$(az vm show --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" --query "id" -o tsv); then
  echo "Unable to read VM resource ID." >&2
  exit 1
fi
if [ -z "$VM_ID" ]; then
  echo "Unable to read VM resource ID." >&2
  exit 1
fi
echo "VM resource ID: $VM_ID"
echo "Starting Bastion tunnel on localhost:$LOCAL_PORT ..."

if command -v ss >/dev/null 2>&1; then
  if ss -ltn "sport = :$LOCAL_PORT" 2>/dev/null | grep -q LISTEN; then
    echo "Local port $LOCAL_PORT is already in use. Stop that process or choose a different LocalPort." >&2
    exit 1
  fi
elif command -v lsof >/dev/null 2>&1; then
  if lsof -i ":$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Local port $LOCAL_PORT is already in use. Stop that process or choose a different LocalPort." >&2
    exit 1
  fi
fi

az network bastion tunnel \
  --name "$BASTION_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --target-resource-id "$VM_ID" \
  --resource-port 80 \
  --port "$LOCAL_PORT" >/dev/null 2>&1 &
TUNNEL_PID=$!

cleanup_tunnel() {
  if kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup_tunnel EXIT

sleep 12

STATUS_CODE=$(curl -s --max-time 20 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$LOCAL_PORT" || echo "000")
if [ "$STATUS_CODE" != "200" ]; then
  echo "IIS endpoint check failed through Bastion tunnel (status: $STATUS_CODE)" >&2
  exit 1
fi
echo "HTTP status: $STATUS_CODE"
echo "Smoke test passed."
