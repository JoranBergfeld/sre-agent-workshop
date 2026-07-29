#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/tools/Invoke-ApprovedRemediation.ps1"
CLEANUP="$ROOT/scripts/cleanup.ps1"
INVESTIGATION="$ROOT/tools/Invoke-VmInvestigation.ps1"
FIXTURES=()
trap 'rm -rf "${FIXTURES[@]}"' EXIT

if traversal_output=$(pwsh -NoProfile -File "$GATE" \
  -Action '../start-iis-app-pool' \
  -ChangeTicket CHG-12345 2>&1); then
  echo "PowerShell path traversal action unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq "Action must match lowercase kebab-case." <<<"$traversal_output"
grep -Fq '$scriptPath = Join-Path $PSScriptRoot "..\scripts\remediation\$Action.ps1"' "$GATE"

GATE_FIXTURE="$ROOT/output/.powershell-gate-fixture-$$"
FIXTURES+=("$GATE_FIXTURE")
mkdir -p "$GATE_FIXTURE"/{output,scripts/remediation,tools}
cp "$GATE" "$GATE_FIXTURE/tools/Invoke-ApprovedRemediation.ps1"
cat > "$GATE_FIXTURE/scripts/remediation/start-iis-app-pool.ps1" <<'EOF'
param(
    [string]$ResourceGroup,
    [string]$VmName
)
Write-Output "remediation succeeded"
EOF

if ! printf 'APPROVE\n' | pwsh -NoProfile -File \
  "$GATE_FIXTURE/tools/Invoke-ApprovedRemediation.ps1" \
  -Action start-iis-app-pool \
  -ChangeTicket CHG-12345 \
  -ResourceGroup rg-test \
  -VmName vm-test >/dev/null; then
  echo "PowerShell successful remediation unexpectedly failed" >&2
  exit 1
fi

cat > "$GATE_FIXTURE/scripts/remediation/start-iis-app-pool.ps1" <<'EOF'
param(
    [string]$ResourceGroup,
    [string]$VmName
)
throw "simulated remediation failure"
EOF

if gate_output=$(printf 'APPROVE\n' | pwsh -NoProfile -File \
  "$GATE_FIXTURE/tools/Invoke-ApprovedRemediation.ps1" \
  -Action start-iis-app-pool \
  -ChangeTicket CHG-12345 \
  -ResourceGroup rg-test \
  -VmName vm-test 2>&1); then
  echo "PowerShell failing remediation unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq "simulated remediation failure" <<<"$gate_output"
mapfile -t gate_statuses < <(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$GATE_FIXTURE/output/actions-audit.log")
[[ "${gate_statuses[*]}" == "approved-attempted succeeded approved-attempted failed" ]]

FIXTURE="$ROOT/output/.powershell-safety-fixture-$$"
FIXTURES+=("$FIXTURE")
mkdir -p "$FIXTURE/bin"

cat > "$FIXTURE/bin/az" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FIXTURE/az-arguments.log"
if [[ "$1 $2" == "group show" ]]; then
  echo "simulated Azure CLI failure" >&2
  exit 14
fi
EOF
chmod +x "$FIXTURE/bin/az"
export FIXTURE

PATH="$FIXTURE/bin:$PATH" pwsh -NoProfile -File "$CLEANUP" \
  -ResourceGroup rg-dry-run \
  -DryRun >/dev/null
if [[ -e "$FIXTURE/az-arguments.log" ]]; then
  echo "PowerShell dry run invoked Azure CLI" >&2
  exit 1
fi

if failure_output=$(PATH="$FIXTURE/bin:$PATH" pwsh -NoProfile -File "$CLEANUP" \
  -ResourceGroup rg-failure \
  -Yes 2>&1); then
  echo "PowerShell cleanup unexpectedly masked Azure CLI failure" >&2
  exit 1
fi
grep -Fq "Azure CLI failed while checking resource group 'rg-failure'." <<<"$failure_output"

grep -Fq '$telemetryConfirmed = $false' "$INVESTIGATION"
grep -Fq 'ConvertFrom-Json' "$INVESTIGATION"
grep -Fq 'KQL query returned no records; telemetry evidence is unavailable.' "$INVESTIGATION"
grep -Fq '$confidence = "low"' "$INVESTIGATION"
grep -Fq 'Invoke-VmRunCommand.ps1' "$INVESTIGATION"

echo "PowerShell gate and cleanup regression checks passed"
