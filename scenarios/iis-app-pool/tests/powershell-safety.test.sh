#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/tools/Invoke-ApprovedRemediation.ps1"
CLEANUP="$ROOT/scripts/cleanup.ps1"
INVESTIGATION="$ROOT/tools/Invoke-VmInvestigation.ps1"

if traversal_output=$(pwsh -NoProfile -File "$GATE" \
  -Action '../start-iis-app-pool' \
  -ChangeTicket CHG-12345 2>&1); then
  echo "PowerShell path traversal action unexpectedly succeeded" >&2
  exit 1
fi
grep -Fq "Action must match lowercase kebab-case." <<<"$traversal_output"
grep -Fq '$scriptPath = Join-Path $PSScriptRoot "..\scripts\remediation\$Action.ps1"' "$GATE"

FIXTURE="$ROOT/tests/.powershell-safety-fixture-$$"
trap 'rm -rf "$FIXTURE"' EXIT
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
