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

OUTPUT_DIR="${SRE_OUTPUT_DIR:-$SCRIPT_DIR/../../output}"
mkdir -p "$OUTPUT_DIR"
ATTEMPT_ID="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
AUDIT_PATH="$OUTPUT_DIR/actions-audit.log"
RESULT_FILE="$OUTPUT_DIR/.remediation-${ATTEMPT_ID}.result"

write_audit() {
  local status="$1"
  local completed="$2"
  local failed_vm="$3"
  local exit_code="$4"
  local failed_vm_json="null"
  if [ -n "$failed_vm" ]; then
    failed_vm_json="\"$failed_vm\""
  fi
  printf '{"timestamp":"%s","attemptId":"%s","ticket":"%s","action":"%s","resourceGroup":"%s","scope":"all-retiring-vms","status":"%s","completedVms":%s,"failedVm":%s,"exitCode":%s}\n' \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$ATTEMPT_ID" "$CHANGE_TICKET" "$ACTION" "$RESOURCE_GROUP" \
    "$status" "$completed" "$failed_vm_json" "$exit_code" >> "$AUDIT_PATH"
}

read_result() {
  RESULT_STATUS=""
  RESULT_COMPLETED="0"
  RESULT_FAILED_VM=""
  [ -f "$RESULT_FILE" ] || return 0
  while IFS='=' read -r key value; do
    case "$key" in
      status) RESULT_STATUS="$value" ;;
      completed) RESULT_COMPLETED="$value" ;;
      failedVm) RESULT_FAILED_VM="$value" ;;
    esac
  done < "$RESULT_FILE"
}

MUTATION_STARTED=false
TERMINAL_AUDITED=false

audit_unexpected_exit() {
  local exit_code=$?
  trap - EXIT
  if [ "$MUTATION_STARTED" = true ] && [ "$TERMINAL_AUDITED" = false ]; then
    read_result || true
    write_audit "failed" "$RESULT_COMPLETED" "$RESULT_FAILED_VM" "$exit_code" || true
    rm -f "$RESULT_FILE"
  fi
  exit "$exit_code"
}

trap audit_unexpected_exit EXIT

write_audit "approved" "0" "" "0"
write_audit "started" "0" "" "0"
MUTATION_STARTED=true

if REMEDIATION_OUTPUT=$(SRE_REMEDIATION_RESULT_FILE="$RESULT_FILE" bash "$SCRIPT_PATH" --resource-group "$RESOURCE_GROUP" 2>&1); then
  read_result
  if [ "$RESULT_STATUS" != "succeeded" ]; then
    write_audit "failed" "$RESULT_COMPLETED" "$RESULT_FAILED_VM" "1"
    TERMINAL_AUDITED=true
    rm -f "$RESULT_FILE"
    printf '%s\n' "$REMEDIATION_OUTPUT"
    echo "Approved remediation failed after completed $RESULT_COMPLETED VM(s); failed VM: ${RESULT_FAILED_VM:-unknown}." >&2
    exit 1
  fi
  write_audit "succeeded" "$RESULT_COMPLETED" "" "0"
  TERMINAL_AUDITED=true
  rm -f "$RESULT_FILE"
  printf '%s\n' "$REMEDIATION_OUTPUT"
  echo "Approved remediation completed and audited."
else
  EXIT_CODE=$?
  read_result
  write_audit "failed" "$RESULT_COMPLETED" "$RESULT_FAILED_VM" "$EXIT_CODE"
  TERMINAL_AUDITED=true
  rm -f "$RESULT_FILE"
  printf '%s\n' "$REMEDIATION_OUTPUT"
  echo "Approved remediation failed after completed $RESULT_COMPLETED VM(s); failed VM: ${RESULT_FAILED_VM:-unknown}." >&2
  exit "$EXIT_CODE"
fi
