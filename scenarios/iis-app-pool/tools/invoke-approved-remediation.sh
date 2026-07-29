#!/usr/bin/env bash
# Approval-gated remediation wrapper.
# Maps an action name to a constrained remediation script, requires a
# CHG/INC ticket and explicit "APPROVE" confirmation, and writes an audit
# entry per execution. The SRE Agent never runs remediation directly —
# every action passes through this gate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIT_STARTED=false

ACTION=""
RESOURCE_GROUP="rg-srelabiisapppool"
VM_NAME="srelabiisa-01"
CHANGE_TICKET=""

while [ $# -gt 0 ]; do
  case "$1" in
    -a|--action) ACTION="$2"; shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -t|--change-ticket) CHANGE_TICKET="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --action <name> --change-ticket <CHG-12345> [--resource-group <rg>] [--vm-name <vm>]"
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
  echo "Action must match lowercase kebab-case." >&2
  exit 1
fi

SCRIPT_PATH="$SCRIPT_DIR/../scripts/remediation/${ACTION}.sh"
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Unknown action '$ACTION': no scripts/remediation/${ACTION}.sh found." >&2
  exit 1
fi

if [ -z "$CHANGE_TICKET" ]; then
  echo "ChangeTicket is required." >&2
  exit 2
fi

if [[ ! "$CHANGE_TICKET" =~ ^(CHG|INC)-[0-9]+$ ]]; then
  echo "ChangeTicket must match CHG-12345 or INC-12345." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_PATH" ]; then
  echo "Approved action script missing: $SCRIPT_PATH" >&2
  exit 1
fi

OUTPUT_DIR="$SCRIPT_DIR/../output"

append_audit() {
  local status="$1"
  local timestamp
  timestamp=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')
  printf '{"timestamp":"%s","ticket":"%s","action":"%s","resourceGroup":"%s","vmName":"%s","status":"%s"}\n' \
    "$timestamp" "$CHANGE_TICKET" "$ACTION" "$RESOURCE_GROUP" "$VM_NAME" "$status" >> "$OUTPUT_DIR/actions-audit.log"
}

finalize_audit() {
  local exit_status=$?
  local terminal_audit_status=0
  if [ "$AUDIT_STARTED" = true ]; then
    if [ "$exit_status" -eq 0 ]; then
      if ! append_audit "succeeded"; then
        echo "Failed to write succeeded audit entry." >&2
        terminal_audit_status=1
      fi
    else
      if ! append_audit "failed"; then
        echo "Failed to write failed audit entry." >&2
        terminal_audit_status=1
      fi
    fi
  fi
  trap - EXIT
  if [ "$exit_status" -ne 0 ]; then
    exit "$exit_status"
  fi
  exit "$terminal_audit_status"
}

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

mkdir -p "$OUTPUT_DIR"
append_audit "approved-attempted"
AUDIT_STARTED=true
trap finalize_audit EXIT

set +e
bash "$SCRIPT_PATH" --resource-group "$RESOURCE_GROUP" --vm-name "$VM_NAME"
remediation_status=$?
set -e
if [ "$remediation_status" -ne 0 ]; then
  exit "$remediation_status"
fi

echo "Approved remediation completed."
