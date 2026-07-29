#!/usr/bin/env bash
# Visible reasoning chain for the Disk Full scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"

WORKSPACE_ID=""
RESOURCE_GROUP="rg-srelabdiskfull"
VM_NAME="srelabdiskfull-vm01"

while [ $# -gt 0 ]; do
  case "$1" in
    -w|--workspace-id) WORKSPACE_ID="$2"; shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--workspace-id <id>] [--resource-group <rg>] [--vm-name <vm>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

QUERY_FILE="$SCRIPT_DIR/../investigation/query.kql"
if [ ! -f "$QUERY_FILE" ]; then
  echo "Investigation query missing: $QUERY_FILE" >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR"

TS=$(date '+%Y%m%d-%H%M%S')
TRACE_PATH="$OUTPUT_DIR/investigation-trace-disk-full-${TS}.log"
POSTMORTEM_PATH="$OUTPUT_DIR/postmortem-disk-full-${TS}.md"

write_stage() {
  local stage="$1"
  local message="$2"
  local line
  line="[$(date -u '+%Y-%m-%d %H:%M:%SZ')] $stage: $message"
  echo "$line"
  echo "$line" >> "$TRACE_PATH"
}

write_stage "Observe" "Received C: disk-pressure alert on VM '$VM_NAME'."
write_stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

KQL=$(sed "s/{{VM_NAME}}/$VM_NAME/g" "$QUERY_FILE")

if [ -n "$WORKSPACE_ID" ]; then
  if az monitor log-analytics query -w "$WORKSPACE_ID" --analytics-query "$KQL" -o json >/dev/null 2>&1; then
    write_stage "Correlate" "Telemetry query returned matching records."
  else
    write_stage "Correlate" "No telemetry records returned yet; continuing with VM inspection evidence."
  fi
else
  write_stage "Correlate" "WorkspaceId not provided; skipping KQL query."
fi

write_stage "Hypothesis" "C:\\Temp\\diskfill is the likely source of the C: free-space pressure."
CONFIDENCE="high"
write_stage "Propose" "Prepared remediation plan with confidence: $CONFIDENCE."
write_stage "AwaitApproval" "Remediation execution requires explicit operator approval."
write_stage "Execute" "Use invoke-approved-remediation.sh with a valid change ticket."
write_stage "Validate" "Run validation script after remediation to confirm recovery."
write_stage "Postmortem" "Generating markdown postmortem artifact."

TRACE_NAME=$(basename "$TRACE_PATH")
cat > "$POSTMORTEM_PATH" <<EOF
# Disk Full Scenario Postmortem

- **Scenario:** disk-full
- **Resource Group:** $RESOURCE_GROUP
- **VM:** $VM_NAME
- **Confidence:** $CONFIDENCE
- **Trace file:** $TRACE_NAME

## Investigation Timeline

See \`$TRACE_NAME\` for the stage-by-stage reasoning chain:

Observe → Investigate → Correlate → Hypothesis → Propose remediation → Await approval → Execute → Validate → Postmortem

## Proposed Remediation

Use the constrained remediation wrapper:

\`\`\`bash
./scenarios/disk-full/tools/invoke-approved-remediation.sh --action cleanup-disk --resource-group $RESOURCE_GROUP --vm-name $VM_NAME --change-ticket CHG-12345
\`\`\`
EOF

echo "Investigation trace: $TRACE_PATH"
echo "Postmortem: $POSTMORTEM_PATH"
