#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabretirement"
TARGET_SIZE="Standard_D2s_v5"
RESULT_FILE="${SRE_REMEDIATION_RESULT_FILE:-}"
COUNT=0
CURRENT_VM=""

write_result() {
  [ -z "$RESULT_FILE" ] && return
  {
    printf 'status=%s\n' "$1"
    printf 'completed=%s\n' "$2"
    printf 'failedVm=%s\n' "$3"
  } > "$RESULT_FILE"
}

on_error() {
  local exit_code=$?
  trap - ERR
  write_result "failed" "$COUNT" "$CURRENT_VM"
  echo "Migration failed after completed $COUNT VM(s); failed VM: ${CURRENT_VM:-unknown}." >&2
  exit "$exit_code"
}

trap on_error ERR

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--resource-group <rg>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

FILTER="[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
AFFECTED=$(az vm list --resource-group "$RESOURCE_GROUP" --query "$FILTER" -o tsv)

if [ -z "$(printf '%s' "$AFFECTED" | tr -d '[:space:]')" ]; then
  write_result "succeeded" "0" ""
  echo "No VMs on a retiring size in $RESOURCE_GROUP. Nothing to migrate."
  exit 0
fi

while IFS= read -r vm; do
  [ -z "$vm" ] && continue
  CURRENT_VM="$vm"
  echo "Resizing $vm -> $TARGET_SIZE ..."
  az vm resize --resource-group "$RESOURCE_GROUP" --name "$vm" --size "$TARGET_SIZE" --only-show-errors >/dev/null
  COUNT=$((COUNT + 1))
done <<< "$AFFECTED"

write_result "succeeded" "$COUNT" ""
echo "Migration complete. Resized $COUNT VM(s) to $TARGET_SIZE."
