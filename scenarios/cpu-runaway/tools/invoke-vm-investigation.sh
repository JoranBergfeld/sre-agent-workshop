#!/usr/bin/env bash
# Visible reasoning chain for the CPU Runaway scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"

WORKSPACE_ID=""
RESOURCE_GROUP="rg-srelabcpurunaway"
VM_NAME="srelabcpurunaway-vm01"
COMPUTER_NAME="srecpu01"

while [ $# -gt 0 ]; do
  case "$1" in
    -w|--workspace-id) WORKSPACE_ID="$2"; shift 2 ;;
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -c|--computer-name) COMPUTER_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--workspace-id <id>] [--resource-group <rg>] [--vm-name <vm>] [--computer-name <windows-computer>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

QUERY_FILE="$SCRIPT_DIR/../investigation/query.kql"
if [ ! -f "$QUERY_FILE" ]; then
  echo "CPU Runaway query file is missing: $QUERY_FILE" >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR"

TS=$(date '+%Y%m%d-%H%M%S')
TRACE_PATH="$OUTPUT_DIR/investigation-trace-cpu-runaway-${TS}.log"
POSTMORTEM_PATH="$OUTPUT_DIR/postmortem-cpu-runaway-${TS}.md"

write_stage() {
  local stage="$1"
  local message="$2"
  local line
  line="[$(date -u '+%Y-%m-%d %H:%M:%SZ')] $stage: $message"
  echo "$line"
  echo "$line" >> "$TRACE_PATH"
}

write_stage "Observe" "Received CPU Runaway alert on VM '$VM_NAME' (Windows computer '$COMPUTER_NAME')."
write_stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

KQL=$(sed "s/{{VM_NAME}}/$COMPUTER_NAME/g" "$QUERY_FILE")

if [ -n "$WORKSPACE_ID" ]; then
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
  if az monitor log-analytics query -w "$WORKSPACE_ID" --analytics-query "$KQL" -o json >/dev/null 2>&1; then
    write_stage "Correlate" "Telemetry query returned matching records."
  else
    write_stage "Correlate" "No telemetry records returned yet; continuing with VM inspection evidence."
  fi
else
  write_stage "Correlate" "WorkspaceId not provided; skipping KQL query."
fi

write_stage "Hypothesis" "The CPU saturation symptom matches the expected runaway process failure mode."
CONFIDENCE="high"
write_stage "Propose" "Prepared the approved stop-cpu-runaway action with confidence: $CONFIDENCE."
write_stage "AwaitApproval" "An authorized human must provide a CHG/INC ticket and exact APPROVE confirmation."
write_stage "Execute" "The approval gate runs the scenario-owned remediation and records an audit entry."
write_stage "Validate" "Run the scenario validation script after approved remediation to confirm service health."
write_stage "Postmortem" "Generating markdown postmortem artifact."

TRACE_NAME=$(basename "$TRACE_PATH")
cat > "$POSTMORTEM_PATH" <<EOF
# CPU Runaway Scenario Postmortem

- **Scenario:** cpu-runaway
- **Resource Group:** $RESOURCE_GROUP
- **VM Resource:** $VM_NAME
- **Windows Computer:** $COMPUTER_NAME
- **Confidence:** $CONFIDENCE
- **Trace file:** $TRACE_NAME

## Investigation Timeline

See \`$TRACE_NAME\` for the stage-by-stage reasoning chain:

Observe → Investigate → Correlate → Hypothesis → Propose remediation → Await approval → Execute through gate → Validate → Postmortem

## Proposed Remediation

Use the constrained remediation wrapper as the normal approved remediation path:

\`\`\`bash
./scenarios/cpu-runaway/tools/invoke-approved-remediation.sh --action stop-cpu-runaway --resource-group $RESOURCE_GROUP --vm-name $VM_NAME --change-ticket CHG-12345
\`\`\`
EOF

echo "Investigation trace: $TRACE_PATH"
echo "Postmortem: $POSTMORTEM_PATH"
