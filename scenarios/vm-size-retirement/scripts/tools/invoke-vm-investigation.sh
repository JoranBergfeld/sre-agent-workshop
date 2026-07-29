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
if RESULT=$(az graph query -q "$QUERY" -o json); then
  stage "Correlate" "Resource Graph returned the affected VM inventory."
  printf '%s\n' "$RESULT"
else
  stage "Correlate" "Resource Graph query failed; retain the advisory and CLI error as evidence."
  exit 1
fi
stage "Hypothesis" "Dv2/DSv2 VMs must be resized before the retirement date."
stage "Propose" "Prepare one issue assigned to @copilot for the controlled migration plan."
stage "AwaitApproval" "A human reviews the Copilot pull request and controls deployment."
stage "Fallback" "If the GitOps route is unavailable, use the local approval gate with a CHG/INC ticket."

cat > "$POSTMORTEM_PATH" <<EOF
# VM Size Retirement Investigation

- **Resource group:** $RESOURCE_GROUP
- **Query:** investigation/query.kql
- **Trace:** $(basename "$TRACE_PATH")

## Proposed recovery

Create one issue assigned to @copilot with the affected VM inventory and
deadline. A human reviews the Copilot pull request, merges it, and controls the
deployment. Direct resizing is an approved manual fallback only.
EOF

echo "Investigation trace: $TRACE_PATH"
echo "Postmortem: $POSTMORTEM_PATH"
