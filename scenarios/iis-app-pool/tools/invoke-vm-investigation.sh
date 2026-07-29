#!/usr/bin/env bash
# Visible reasoning chain for a VM scenario: Observe → Investigate → Correlate
# → Hypothesis → Propose → AwaitApproval → Execute → Validate → Postmortem.
# Writes a stage-by-stage trace and a markdown postmortem to this capsule's output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../output"

WORKSPACE_ID=""
RESOURCE_GROUP="rg-srelabiisapppool"
VM_NAME="srelabiisa-01"
SCENARIO="iis-app-pool"

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
  echo "Investigation query is missing: $QUERY_FILE" >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR"

TS=$(date '+%Y%m%d-%H%M%S')
TRACE_PATH="$OUTPUT_DIR/investigation-trace-${SCENARIO}-${TS}.log"
POSTMORTEM_PATH="$OUTPUT_DIR/postmortem-${SCENARIO}-${TS}.md"

write_stage() {
  local stage="$1"
  local message="$2"
  local line
  line="[$(date -u '+%Y-%m-%d %H:%M:%SZ')] $stage: $message"
  echo "$line"
  echo "$line" >> "$TRACE_PATH"
}

write_stage "Observe" "Received alert for scenario '$SCENARIO' on VM '$VM_NAME'."
write_stage "Investigate" "Collecting telemetry from Azure Monitor and VM runtime state."

KQL=$(sed "s/{{VM_NAME}}/$VM_NAME/g" "$QUERY_FILE")
TELEMETRY_CONFIRMED=false
INSPECTION_STOPPED=false
INSPECTION_CONTRADICTORY=false

inspect_vm() {
  local inspection_script inspection_result inspection_value
  inspection_script="Import-Module WebAdministration
Get-WebAppPoolState -Name 'DefaultAppPool' | Select-Object Name, Value | ConvertTo-Json -Compress"

  if inspection_result=$("$SCRIPT_DIR/invoke-vm-run-command.sh" \
    --resource-group "$RESOURCE_GROUP" \
    --vm-name "$VM_NAME" \
    --script "$inspection_script"); then
    if printf '%s' "$inspection_result" | jq -e '.Value == "Stopped"' >/dev/null 2>&1; then
      INSPECTION_STOPPED=true
      write_stage "InspectVM" "VM inspection emitted Value exactly 'Stopped'."
    elif printf '%s' "$inspection_result" | jq -e '(.Value | type) == "string"' >/dev/null 2>&1; then
      inspection_value=$(printf '%s' "$inspection_result" | jq -r '.Value')
      INSPECTION_CONTRADICTORY=true
      write_stage "InspectVM" "VM inspection emitted Value '$inspection_value', contradicting the stopped app-pool hypothesis."
    else
      write_stage "InspectVM" "VM inspection output is unparseable; the stopped app-pool hypothesis is unconfirmed."
    fi
  else
    write_stage "InspectVM" "VM inspection failed; the app-pool state remains unconfirmed."
  fi
}

if [ -n "$WORKSPACE_ID" ]; then
  if QUERY_RESULT=$(az monitor log-analytics query -w "$WORKSPACE_ID" --analytics-query "$KQL" -o json 2>/dev/null); then
    if command -v jq >/dev/null 2>&1 && printf '%s' "$QUERY_RESULT" | jq -e '[.tables[]?.rows[]?] | length > 0' >/dev/null 2>&1; then
      TELEMETRY_CONFIRMED=true
      write_stage "Correlate" "KQL query returned matching telemetry records."
    elif command -v jq >/dev/null 2>&1; then
      write_stage "Correlate" "KQL query returned no records; telemetry evidence is unavailable."
    else
      write_stage "Correlate" "KQL query results could not be evaluated because jq is unavailable; telemetry evidence is unavailable."
    fi
  else
    write_stage "Correlate" "KQL query failed; telemetry evidence is unavailable."
  fi
else
  write_stage "Correlate" "WorkspaceId not provided; telemetry evidence is unavailable."
fi

inspect_vm

if [ "$TELEMETRY_CONFIRMED" = true ] && [ "$INSPECTION_STOPPED" = true ]; then
  CONFIDENCE="high"
  write_stage "Hypothesis" "Telemetry and VM inspection support a stopped IIS app pool."
elif [ "$INSPECTION_CONTRADICTORY" = true ]; then
  CONFIDENCE="low"
  write_stage "Hypothesis" "VM inspection contradicts a stopped IIS app pool."
elif [ "$TELEMETRY_CONFIRMED" = true ]; then
  CONFIDENCE="medium"
  write_stage "Hypothesis" "Telemetry supports a stopped IIS app pool, but VM inspection is unavailable."
else
  CONFIDENCE="low"
  write_stage "Hypothesis" "Telemetry is incomplete; a stopped IIS app pool remains an unconfirmed hypothesis."
fi

write_stage "Propose" "Prepared remediation plan with confidence: $CONFIDENCE."
write_stage "AwaitApproval" "Remediation execution requires explicit operator approval."
write_stage "Execute" "Use invoke-approved-remediation.sh with a valid change ticket."
write_stage "Validate" "Run validation script after remediation to confirm recovery."
write_stage "Postmortem" "Generating markdown postmortem artifact."

TRACE_NAME=$(basename "$TRACE_PATH")
cat > "$POSTMORTEM_PATH" <<EOF
# VM Scenario Postmortem

- **Scenario:** $SCENARIO
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
./scenarios/iis-app-pool/tools/invoke-approved-remediation.sh --action start-iis-app-pool --resource-group $RESOURCE_GROUP --vm-name $VM_NAME --change-ticket CHG-12345
\`\`\`
EOF

echo "Investigation trace: $TRACE_PATH"
echo "Postmortem: $POSTMORTEM_PATH"
