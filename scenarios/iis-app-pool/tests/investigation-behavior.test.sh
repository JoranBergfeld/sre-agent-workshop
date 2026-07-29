#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL="$ROOT/tools/invoke-vm-investigation.sh"
FIXTURES=()

cleanup_fixtures() {
  rm -rf "${FIXTURES[@]}"
}
trap cleanup_fixtures EXIT

run_case() {
  local name="$1"
  local az_body="$2"
  local inspection_output="$3"
  local expected_message="$4"
  local expected_confidence="$5"
  local fixture="$ROOT/output/.investigation-${name}-fixture-$$"
  FIXTURES+=("$fixture")
  mkdir -p "$fixture"/{bin,investigation,output,tools}

  cp "$TOOL" "$fixture/tools/invoke-vm-investigation.sh"
  cp "$ROOT/investigation/query.kql" "$fixture/investigation/query.kql"
  cat > "$fixture/tools/invoke-vm-run-command.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$FIXTURE/inspection-arguments.txt"
  printf '%s\n' "$INSPECTION_OUTPUT"
EOF
  printf '%s\n' "$az_body" > "$fixture/bin/az"
  chmod +x "$fixture"/{bin/az,tools/invoke-vm-investigation.sh,tools/invoke-vm-run-command.sh}

  FIXTURE="$fixture" INSPECTION_OUTPUT="$inspection_output" PATH="$fixture/bin:$PATH" \
    "$fixture/tools/invoke-vm-investigation.sh" \
      --workspace-id workspace-test \
      --resource-group rg-test \
      --vm-name vm-test >/dev/null

  local trace postmortem
  trace="$(find "$fixture/output" -name 'investigation-trace-*.log' -print -quit)"
  postmortem="$(find "$fixture/output" -name 'postmortem-*.md' -print -quit)"
  grep -Fq "$expected_message" "$trace"
  grep -Fq -- "- **Confidence:** $expected_confidence" "$postmortem"
}

run_case empty '#!/usr/bin/env bash
printf "%s\n" "{\"tables\":[{\"rows\":[]}]}"' \
  '{"Name":"DefaultAppPool","Value":"Stopped"}' \
  "KQL query returned no records; telemetry evidence is unavailable." \
  low

run_case failed '#!/usr/bin/env bash
exit 9' \
  '{"Name":"DefaultAppPool","Value":"Stopped"}' \
  "KQL query failed; telemetry evidence is unavailable." \
  low

run_case stopped '#!/usr/bin/env bash
printf "%s\n" "{\"tables\":[{\"rows\":[[\"evidence\"]]}]}"' \
  '{"Name":"DefaultAppPool","Value":"Stopped"}' \
  "VM inspection emitted Value exactly 'Stopped'." \
  high

run_case running '#!/usr/bin/env bash
printf "%s\n" "{\"tables\":[{\"rows\":[[\"evidence\"]]}]}"' \
  '{"Name":"DefaultAppPool","Value":"Started"}' \
  "VM inspection emitted Value 'Started', contradicting the stopped app-pool hypothesis." \
  low

run_case malformed '#!/usr/bin/env bash
printf "%s\n" "{\"tables\":[{\"rows\":[[\"evidence\"]]}]}"' \
  'not-json' \
  "VM inspection output is unparseable; the stopped app-pool hypothesis is unconfirmed." \
  medium

echo "investigation uncertainty regression checks passed"
