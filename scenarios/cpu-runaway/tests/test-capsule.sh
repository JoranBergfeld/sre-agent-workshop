#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPSULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$SCRIPT_DIR/.test-work-$$"
MOCK_BIN="$WORK_DIR/bin"
AZ_LOG="$WORK_DIR/az.log"
AUDIT_LOG="$WORK_DIR/output/actions-audit.log"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

require_file() {
  [ -f "$CAPSULE_DIR/$1" ] || fail "missing required file: $1"
}

assert_contains() {
  local needle="$1"
  local file="$2"
  grep -F -- "$needle" "$file" >/dev/null || fail "expected '$needle' in $file"
}

assert_not_contains() {
  local needle="$1"
  local file="$2"
  if grep -F -- "$needle" "$file" >/dev/null; then
    fail "did not expect '$needle' in $file"
  fi
}

for required in \
  README.md \
  scenario.yaml \
  infra/bicep/main.bicep \
  infra/bicep/main.bicepparam \
  infra/bicep/modules/identity.bicep \
  infra/bicep/modules/monitoring.bicep \
  infra/bicep/modules/network.bicep \
  infra/bicep/modules/vm.bicep \
  infra/bicep/modules/alert.bicep \
  investigation/query.kql \
  scripts/setup.sh \
  scripts/setup.ps1 \
  scripts/cleanup.sh \
  scripts/cleanup.ps1 \
  scripts/inject.sh \
  scripts/inject.ps1 \
  scripts/validate.sh \
  scripts/validate.ps1 \
  scripts/remediation/stop-cpu-runaway.sh \
  scripts/remediation/stop-cpu-runaway.ps1 \
  tools/invoke-approved-remediation.sh \
  tools/Invoke-ApprovedRemediation.ps1 \
  tools/invoke-vm-investigation.sh \
  tools/Invoke-VmInvestigation.ps1 \
  tools/invoke-vm-run-command.sh \
  tools/Invoke-VmRunCommand.ps1 \
  output/.gitkeep; do
  require_file "$required"
done

assert_contains "platform: Azure Virtual Machines" "$CAPSULE_DIR/scenario.yaml"
assert_contains "incidentType: Compute saturation" "$CAPSULE_DIR/scenario.yaml"
assert_contains "costProfile: high" "$CAPSULE_DIR/scenario.yaml"
assert_contains "guide: README.md" "$CAPSULE_DIR/scenario.yaml"
assert_contains "bash: scripts/remediation/stop-cpu-runaway.sh" "$CAPSULE_DIR/scenario.yaml"
assert_contains "powershell: scripts/remediation/stop-cpu-runaway.ps1" "$CAPSULE_DIR/scenario.yaml"
assert_contains "query: investigation/query.kql" "$CAPSULE_DIR/scenario.yaml"
assert_contains "module alert 'modules/alert.bicep'" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_not_contains "scenario-alerts" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_contains "scenario: 'cpu-runaway'" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_contains "environment: 'demo'" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_contains "param workloadName = 'srelabcpurunaway'" "$CAPSULE_DIR/infra/bicep/main.bicepparam"
assert_contains "dataCollectionRuleId: monitoring.outputs.cpuDataCollectionRuleId" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_contains "Microsoft.Insights/dataCollectionRules" "$CAPSULE_DIR/infra/bicep/modules/monitoring.bicep"
assert_contains "Microsoft-Perf" "$CAPSULE_DIR/infra/bicep/modules/monitoring.bicep"
assert_contains "\\\\Processor(_Total)\\\\% Processor Time" "$CAPSULE_DIR/infra/bicep/modules/monitoring.bicep"
assert_contains "dataCollectionRuleId string" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "dataCollectionRuleAssociations" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "var vmComputerNames" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "'srecpu01'" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "'srecpu02'" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "computerName: vmComputerNames[i]" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "output vmComputerNames array" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"
assert_contains "output vmComputerNames array" "$CAPSULE_DIR/infra/bicep/main.bicep"
assert_contains "[Math]::Max(2, [Environment]::ProcessorCount)" "$CAPSULE_DIR/scripts/inject.sh"
assert_contains "[Math]::Max(2, [Environment]::ProcessorCount)" "$CAPSULE_DIR/scripts/inject.ps1"
assert_contains "cpu-runaway-state.json" "$CAPSULE_DIR/scripts/remediation/stop-cpu-runaway.sh"
assert_contains "cpu-runaway-state.json" "$CAPSULE_DIR/scripts/remediation/stop-cpu-runaway.ps1"
assert_contains "sre-cpu-runaway-v1" "$CAPSULE_DIR/scripts/remediation/stop-cpu-runaway.sh"
assert_contains "normal remediation" "$CAPSULE_DIR/README.md"
assert_not_contains "manual fallback" "$CAPSULE_DIR/README.md"
assert_not_contains "manual fallback" "$CAPSULE_DIR/docs/02-configure-incident-response.md"
assert_not_contains "manual fallback" "$CAPSULE_DIR/docs/90-watch-agent-workflow.md"
assert_not_contains "manual fallback" "$CAPSULE_DIR/knowledge/operational-guidelines.md"
assert_not_contains "--scenario" "$CAPSULE_DIR/tools/invoke-vm-investigation.sh"
assert_not_contains "scenarios/*" "$CAPSULE_DIR/tools/invoke-approved-remediation.sh"
assert_contains 'scripts/remediation/${ACTION}.sh' "$CAPSULE_DIR/tools/invoke-approved-remediation.sh"
assert_contains 'scripts\remediation\$Action.ps1' "$CAPSULE_DIR/tools/Invoke-ApprovedRemediation.ps1"

if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -Command '
    $failed = $false
    Get-ChildItem -Recurse "'"$CAPSULE_DIR"'" -Filter *.ps1 | ForEach-Object {
      $tokens = $null
      $errors = $null
      [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
      if ($errors.Count) {
        $errors | ForEach-Object { Write-Error "$($_.Extent.File):$($_.Extent.StartLineNumber): $($_.Message)" }
        $failed = $true
      }
    }
    if ($failed) { exit 1 }
  ' || fail "PowerShell parser rejected a capsule script"
fi

if grep -R -F --exclude-dir=tests --include='*.sh' --include='*.ps1' --include='*.bicep' --include='*.bicepparam' --include='*.yaml' --include='*.md' \
  'srelabvm' "$CAPSULE_DIR" >/dev/null; then
  fail "capsule must not retain the srelabvm default"
fi

mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/az" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$AZ_LOG"

case "${1:-} ${2:-} ${3:-}" in
  "group show "*)
    case "${AZ_GROUP_SHOW_MODE:-success}" in
      missing)
        printf 'ResourceGroupNotFound\n' >&2
        exit 3
        ;;
      auth-failure)
        printf 'Please run az login\n' >&2
        exit 1
        ;;
      *)
        printf '{}\n'
        ;;
    esac
    ;;
  "vm run-command invoke")
    printf '%s\n' '{"value":[{"code":"ComponentStatus/StdOut/succeeded","message":"simulated VM command"}]}'
    ;;
esac
EOF
chmod +x "$MOCK_BIN/az"

echo "Testing approval gate success and temporary audit..."
printf 'APPROVE\n' | PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" CPU_RUNAWAY_OUTPUT_DIR="$WORK_DIR/output" \
  bash "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" \
    --action stop-cpu-runaway \
    --resource-group rg-srelabcpurunaway \
    --vm-name srelabcpurunaway-vm01 \
    --change-ticket CHG-12345

[ -f "$AUDIT_LOG" ] || fail "approved remediation did not write an audit record"
assert_contains '"ticket":"CHG-12345"' "$AUDIT_LOG"
assert_contains '"action":"stop-cpu-runaway"' "$AUDIT_LOG"
assert_contains '"status":"executed"' "$AUDIT_LOG"

echo "Testing approval gate invalid ticket..."
if PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
  bash "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" \
    --action stop-cpu-runaway --change-ticket INVALID-123 >"$WORK_DIR/invalid-ticket.log" 2>&1; then
  fail "invalid ticket was accepted"
fi
assert_contains "ChangeTicket must match" "$WORK_DIR/invalid-ticket.log"

echo "Testing approval gate explicit approval..."
if printf 'approve\n' | PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
  CPU_RUNAWAY_OUTPUT_DIR="$WORK_DIR/output" \
  bash "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" \
    --action stop-cpu-runaway --change-ticket INC-12345 >"$WORK_DIR/not-approved.log" 2>&1; then
  fail "non-exact approval was accepted"
fi
assert_contains "Explicit approval was not granted" "$WORK_DIR/not-approved.log"

echo "Testing cleanup parser..."
: > "$AZ_LOG"
PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
  bash "$CAPSULE_DIR/scripts/cleanup.sh" --yes
assert_contains "group delete --name rg-srelabcpurunaway --yes --no-wait" "$AZ_LOG"

: > "$AZ_LOG"
PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
  bash "$CAPSULE_DIR/scripts/cleanup.sh" --resource-group rg-custom --yes
assert_contains "group delete --name rg-custom --yes --no-wait" "$AZ_LOG"

echo "Testing cleanup dry run and Azure CLI failures..."
: > "$AZ_LOG"
PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
  bash "$CAPSULE_DIR/scripts/cleanup.sh" --resource-group rg-dry-run --yes --dry-run
if grep -F "group delete" "$AZ_LOG" >/dev/null; then
  fail "Bash cleanup dry run invoked deletion"
fi

if PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" AZ_GROUP_SHOW_MODE=auth-failure \
  bash "$CAPSULE_DIR/scripts/cleanup.sh" --yes >"$WORK_DIR/bash-auth-failure.log" 2>&1; then
  fail "Bash cleanup treated Azure authentication failure as a missing resource group"
fi
assert_contains "Please run az login" "$WORK_DIR/bash-auth-failure.log"

if command -v pwsh >/dev/null 2>&1; then
  : > "$AZ_LOG"
  PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
    pwsh -NoProfile -File "$CAPSULE_DIR/scripts/cleanup.ps1" \
      -ResourceGroup rg-powershell --yes
  assert_contains "group delete --name rg-powershell --yes --no-wait" "$AZ_LOG"

  : > "$AZ_LOG"
  PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" \
    pwsh -NoProfile -File "$CAPSULE_DIR/scripts/cleanup.ps1" \
      -ResourceGroup rg-dry-run -Yes -DryRun
  if grep -F "group delete" "$AZ_LOG" >/dev/null; then
    fail "PowerShell cleanup dry run invoked deletion"
  fi

  if PATH="$MOCK_BIN:$PATH" AZ_LOG="$AZ_LOG" AZ_GROUP_SHOW_MODE=auth-failure \
    pwsh -NoProfile -File "$CAPSULE_DIR/scripts/cleanup.ps1" --yes >"$WORK_DIR/powershell-auth-failure.log" 2>&1; then
    fail "PowerShell cleanup treated Azure authentication failure as a missing resource group"
  fi
  assert_contains "Please run az login" "$WORK_DIR/powershell-auth-failure.log"
fi

echo "PASS: CPU Runaway capsule tests"
