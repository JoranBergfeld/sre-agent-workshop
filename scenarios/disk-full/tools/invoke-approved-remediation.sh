#!/usr/bin/env bash
# Approval-gated manual fallback for this scenario's constrained remediation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ACTION=""
RESOURCE_GROUP="rg-srelabdiskfull"
VM_NAME="srelabdiskfull-vm01"
CHANGE_TICKET=""

while [ $# -gt 0 ]; do
  case "$1" in
    -a|--action) ACTION="$2"; shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -t|--change-ticket) CHANGE_TICKET="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --action <cleanup-disk|cleanup-temp> --change-ticket <CHG-12345> [--resource-group <rg>] [--vm-name <vm>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$ACTION" ]; then
  echo "Action is required." >&2
  exit 2
fi

if [[ ! "$ACTION" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Action must be a kebab-case remediation action." >&2
  exit 1
fi
SCRIPT_PATH="$SCRIPT_DIR/../scripts/remediation/${ACTION}.sh"

if [ -z "$CHANGE_TICKET" ]; then
  echo "ChangeTicket is required." >&2
  exit 2
fi

if [[ ! "$CHANGE_TICKET" =~ ^(CHG|INC)-[0-9]+$ ]]; then
  echo "ChangeTicket must match CHG-12345 or INC-12345." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Unknown action '$ACTION': no approved script at scripts/remediation/${ACTION}.sh." >&2
  exit 1
fi

echo "========================================"
echo "  Approval Gate"
echo "========================================"
echo "Ticket:        $CHANGE_TICKET"
echo "Action:        $ACTION"
echo "ResourceGroup: $RESOURCE_GROUP"
echo "VM:            $VM_NAME"
echo "========================================"
read -r -p "Type APPROVE to execute: " APPROVAL
if [ "$APPROVAL" != "APPROVE" ]; then
  echo "Remediation canceled. Explicit approval was not granted." >&2
  exit 1
fi

bash "$SCRIPT_PATH" --resource-group "$RESOURCE_GROUP" --vm-name "$VM_NAME"

OUTPUT_DIR="$SCRIPT_DIR/../output"
mkdir -p "$OUTPUT_DIR"

TS=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')

printf '{"timestamp":"%s","ticket":"%s","action":"%s","resourceGroup":"%s","vmName":"%s","status":"executed"}\n' \
  "$TS" "$CHANGE_TICKET" "$ACTION" "$RESOURCE_GROUP" "$VM_NAME" >> "$OUTPUT_DIR/actions-audit.log"

echo "Approved remediation completed and audited."
