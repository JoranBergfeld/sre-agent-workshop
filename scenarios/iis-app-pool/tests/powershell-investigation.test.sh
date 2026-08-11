#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL="$ROOT/tools/Invoke-VmInvestigation.ps1"
FIXTURES=()

cleanup_fixtures() {
  rm -rf "${FIXTURES[@]}"
}
trap cleanup_fixtures EXIT

run_case() {
  local name="$1"
  local inspection_output="$2"
  local expected_message="$3"
  local expected_confidence="$4"
  local fixture="$ROOT/output/.powershell-investigation-${name}-fixture-$$"
  FIXTURES+=("$fixture")
  mkdir -p "$fixture"/{bin,investigation,output,tools}

  cp "$TOOL" "$fixture/tools/Invoke-VmInvestigation.ps1"
  cp "$ROOT/investigation/query.kql" "$fixture/investigation/query.kql"
  cat > "$fixture/tools/Invoke-VmRunCommand.ps1" <<'EOF'
param(
    [string]$ResourceGroup,
    [string]$VmName,
    [string]$Script
)
Write-Output $env:INSPECTION_OUTPUT
EOF
  cat > "$fixture/bin/az" <<'EOF'
#!/usr/bin/env bash
if [[ "$1 $2" == "account show" ]]; then
  if [[ " $* " == *" --query name "* ]]; then
    printf 'test-subscription\n'
  else
    printf '00000000-0000-0000-0000-000000000000\n'
  fi
  exit 0
fi
printf '%s\n' '{"tables":[{"rows":[["evidence"]]}]}'
EOF
  chmod +x "$fixture/bin/az"

  INSPECTION_OUTPUT="$inspection_output" PATH="$fixture/bin:$PATH" \
    pwsh -NoProfile -File "$fixture/tools/Invoke-VmInvestigation.ps1" \
      -WorkspaceId workspace-test \
      -ResourceGroup rg-test \
      -VmName vm-test >/dev/null

  local trace postmortem
  trace="$(find "$fixture/output" -name 'investigation-trace-*.log' -print -quit)"
  postmortem="$(find "$fixture/output" -name 'postmortem-*.md' -print -quit)"
  grep -Fq "$expected_message" "$trace"
  grep -Fq -- "- **Confidence:** $expected_confidence" "$postmortem"
}

run_case stopped \
  '{"Name":"DefaultAppPool","Value":"Stopped"}' \
  "VM inspection emitted Value exactly 'Stopped'." \
  high

run_case running \
  '{"Name":"DefaultAppPool","Value":"Started"}' \
  "VM inspection emitted Value 'Started', contradicting the stopped app-pool hypothesis." \
  low

run_case malformed \
  'not-json' \
  "VM inspection output is unparseable; the stopped app-pool hypothesis is unconfirmed." \
  medium

echo "PowerShell investigation regression checks passed"
