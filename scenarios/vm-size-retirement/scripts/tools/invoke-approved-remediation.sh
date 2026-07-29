#!/usr/bin/env bash
# The only direct-action path: validates ticket, requires explicit approval, and audits execution.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ACTION=""
RESOURCE_GROUP="rg-srelabretirement"
CHANGE_TICKET=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -a|--action) ACTION="$2"; shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -t|--change-ticket) CHANGE_TICKET="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --action migrate-vm-size --change-ticket <CHG-12345> [--resource-group <rg>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$ACTION" != "migrate-vm-size" ]; then
  echo "Unknown action '$ACTION'. Only migrate-vm-size is available in this capsule." >&2
  exit 1
fi

if [[ ! "$CHANGE_TICKET" =~ ^(CHG|INC)-[0-9]+$ ]]; then
  echo "ChangeTicket must match CHG-12345 or INC-12345." >&2
  exit 1
fi

SCRIPT_PATH="$SCRIPT_DIR/../remediation/migrate-vm-size.sh"
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Approved action script missing: $SCRIPT_PATH" >&2
  exit 1
fi

echo "========================================"
echo "Approval Gate"
echo "Ticket:        $CHANGE_TICKET"
echo "Action:        $ACTION"
echo "ResourceGroup: $RESOURCE_GROUP"
echo "Scope:         all VMs on retiring SKUs"
echo "========================================"
read -r -p "Type APPROVE to execute: " APPROVAL
if [ "$APPROVAL" != "APPROVE" ]; then
  echo "Remediation canceled. Explicit approval was not granted." >&2
  exit 1
fi

bash "$SCRIPT_PATH" --resource-group "$RESOURCE_GROUP"

OUTPUT_DIR="${SRE_OUTPUT_DIR:-$SCRIPT_DIR/../../output}"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '{"timestamp":"%s","ticket":"%s","action":"%s","resourceGroup":"%s","scope":"all-retiring-vms","status":"executed"}\n' \
  "$TIMESTAMP" "$CHANGE_TICKET" "$ACTION" "$RESOURCE_GROUP" >> "$OUTPUT_DIR/actions-audit.log"

echo "Approved remediation completed and audited."
