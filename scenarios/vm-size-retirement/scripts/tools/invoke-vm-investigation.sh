#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_FILE="$SCRIPT_DIR/../../investigation/query.kql"
OUTPUT_DIR="$SCRIPT_DIR/../../output"
RESOURCE_GROUP="rg-srelabretirement"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--resource-group <rg>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$QUERY_FILE" ]; then
  echo "Local investigation query is missing: $QUERY_FILE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date -u '+%Y%m%d-%H%M%S')
TRACE_PATH="$OUTPUT_DIR/investigation-trace-${TIMESTAMP}.log"
POSTMORTEM_PATH="$OUTPUT_DIR/postmortem-${TIMESTAMP}.md"
QUERY=$(sed "s/{{RESOURCE_GROUP}}/${RESOURCE_GROUP}/g" "$QUERY_FILE")

stage() {
  local name="$1"
  local message="$2"
  local line="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $name: $message"
  echo "$line"
  echo "$line" >> "$TRACE_PATH"
}

stage "Observe" "Received VM size retirement advisory for resource group '$RESOURCE_GROUP'."
stage "Investigate" "Running the capsule's Azure Resource Graph query."
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
if RESULT=$(az graph query -q "$QUERY" -o json); then
  stage "Correlate" "Resource Graph returned the affected VM inventory."
  printf '%s\n' "$RESULT"
else
  stage "Correlate" "Resource Graph query failed; retain the advisory and CLI error as evidence."
  exit 1
fi
stage "Hypothesis" "Dv2/DSv2 VMs must be resized before the retirement date."
stage "Propose" "Prepared the approval-gated migrate-vm-size action for the affected fleet."
stage "AwaitApproval" "An authorized operator must provide a CHG/INC ticket and type exact APPROVE."
stage "Execute" "Use the local approval gate; the SRE Agent does not execute remediation."

cat > "$POSTMORTEM_PATH" <<EOF
# VM Size Retirement Investigation

- **Resource group:** $RESOURCE_GROUP
- **Query:** investigation/query.kql
- **Trace:** $(basename "$TRACE_PATH")

## Proposed recovery

An authorized operator reviews the affected VM inventory and deadline, then
uses the approval gate with a valid CHG/INC ticket and exact APPROVE response.
The gate audits the fleet migration; the SRE Agent does not execute it.
EOF

echo "Investigation trace: $TRACE_PATH"
echo "Postmortem: $POSTMORTEM_PATH"
