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
  local expected_message="$3"
  local fixture="$ROOT/output/.investigation-${name}-fixture-$$"
  FIXTURES+=("$fixture")
  mkdir -p "$fixture"/{bin,investigation,output,tools}

  cp "$TOOL" "$fixture/tools/invoke-vm-investigation.sh"
  cp "$ROOT/investigation/query.kql" "$fixture/investigation/query.kql"
  cat > "$fixture/tools/invoke-vm-run-command.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$FIXTURE/inspection-arguments.txt"
echo '{"name":"DefaultAppPool","value":"Stopped"}'
EOF
  printf '%s\n' "$az_body" > "$fixture/bin/az"
  chmod +x "$fixture"/{bin/az,tools/invoke-vm-investigation.sh,tools/invoke-vm-run-command.sh}

  FIXTURE="$fixture" PATH="$fixture/bin:$PATH" \
    "$fixture/tools/invoke-vm-investigation.sh" \
      --workspace-id workspace-test \
      --resource-group rg-test \
      --vm-name vm-test >/dev/null

  local trace postmortem
  trace="$(find "$fixture/output" -name 'investigation-trace-*.log' -print -quit)"
  postmortem="$(find "$fixture/output" -name 'postmortem-*.md' -print -quit)"
  grep -Fq "VM inspection reported the current IIS app-pool state." "$trace"
  grep -Fq "$expected_message" "$trace"
  grep -Fq -- "- **Confidence:** low" "$postmortem"
}

run_case empty '#!/usr/bin/env bash
printf "%s\n" "{\"tables\":[{\"rows\":[]}]}"' \
  "KQL query returned no records; telemetry evidence is unavailable."

run_case failed '#!/usr/bin/env bash
exit 9' \
  "KQL query failed; telemetry evidence is unavailable."

echo "investigation uncertainty regression checks passed"
