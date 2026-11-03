#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-srelabretirement"
TARGET_SIZE=""
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
FILTER="[?hardwareProfile.vmSize=='Standard_DS1_v2' || hardwareProfile.vmSize=='Standard_DS2_v2'].name"
AFFECTED=$(az vm list --resource-group "$RESOURCE_GROUP" --query "$FILTER" -o tsv)

if [ -z "$(printf '%s' "$AFFECTED" | tr -d '[:space:]')" ]; then
  write_result "succeeded" "0" ""
  echo "No VMs on a retiring size in $RESOURCE_GROUP. Nothing to migrate."
  exit 0
fi

# Preflight before the first resize: the recorded same-region target must still
# be eligible, with target-family and regional quota for every pending legacy
# VM (deallocated VMs count too), so the action cannot stop half way for quota.
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
preflight_failed() {
  trap - ERR
  write_result "failed" "0" ""
  echo "Preflight failed: $1 No VM was resized." >&2
  exit 1
}
command -v node >/dev/null 2>&1 || preflight_failed "Node.js 20+ is required for the quota preflight."
PREFLIGHT=$(node "$REPO_ROOT/scripts/placement/provision.mjs" check vm-size-retirement \
  --resource-group "$RESOURCE_GROUP" --parts targets --no-region-fallback --record-target \
  --claim-settle-seconds "${SRE_TARGET_CLAIM_SETTLE_SECONDS:-30}" --json) \
  || preflight_failed "the recorded remediation target lacks eligibility or quota for the whole retiring fleet (see above)."
TARGET_SIZE=$(printf '%s' "$PREFLIGHT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!r.pinnedLocation||!r.remediationTarget)process.exit(1);process.stdout.write(r.remediationTarget)})') \
  || preflight_failed "no recorded same-region remediation target was found for $RESOURCE_GROUP."
echo "Preflight passed: resizing in ${RESOURCE_GROUP}'s region to $TARGET_SIZE."

while IFS= read -r vm; do
  [ -z "$vm" ] && continue
  CURRENT_VM="$vm"
  # Re-verify before every resize: the recorded target is unchanged and no VM
  # was resized to another target by a concurrent run (fails closed).
  node "$REPO_ROOT/scripts/placement/provision.mjs" verify-target vm-size-retirement \
    --resource-group "$RESOURCE_GROUP" --target "$TARGET_SIZE" >/dev/null
  echo "Resizing $vm -> $TARGET_SIZE ..."
  az vm resize --resource-group "$RESOURCE_GROUP" --name "$vm" --size "$TARGET_SIZE" --only-show-errors >/dev/null
  COUNT=$((COUNT + 1))
done <<< "$AFFECTED"

write_result "succeeded" "$COUNT" ""
echo "Migration complete. Resized $COUNT VM(s) to $TARGET_SIZE."
