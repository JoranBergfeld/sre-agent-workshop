#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPSULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRATCH_DIR="$SCRIPT_DIR/.disk-full-test-$$"
FIXTURE_DIR="$SCRATCH_DIR/capsule"
FAKE_BIN="$SCRATCH_DIR/bin"
AUDIT_LOG="$FIXTURE_DIR/output/actions-audit.log"

cleanup() {
  rm -rf "$SCRATCH_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail "expected '$expected' in $file"
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "did not expect '$unexpected' in $file"
  fi
}

require_file() {
  [ -f "$1" ] || fail "missing required file: $1"
}

assert_stale_pid_reuse_is_safe() {
  local cleanup_script="$1"
  assert_contains "$cleanup_script" '$ownershipMatches ='
  assert_contains "$cleanup_script" 'if ($ownershipMatches) {'
  assert_contains "$cleanup_script" "left process untouched."
  assert_not_contains "$cleanup_script" 'if ($workloadPid) { Stop-Process'
}

mkdir -p "$FAKE_BIN" "$FIXTURE_DIR/output"
cp -R "$CAPSULE_DIR/scripts" "$FIXTURE_DIR/scripts"
cp -R "$CAPSULE_DIR/tools" "$FIXTURE_DIR/tools"
cp -R "$CAPSULE_DIR/investigation" "$FIXTURE_DIR/investigation"
cat > "$FAKE_BIN/az" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${AZ_CALL_LOG:?}"
case "$*" in
  "account set"*) exit 0 ;;
  "account show "*"--query name"*) printf 'test-subscription\n' ;;
  "account show"*) printf '00000000-0000-0000-0000-000000000000\n' ;;
  "group show"*) exit 0 ;;
  "group delete"*) exit 0 ;;
  "vm run-command invoke"*)
    printf '%s\n' '{"value":[{"code":"ComponentStatus/StdOut/succeeded","message":"ok"},{"code":"ComponentStatus/StdErr/succeeded","message":""}]}'
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE_BIN/az"

for path in \
  "$CAPSULE_DIR/scenario.yaml" \
  "$CAPSULE_DIR/infra/bicep/main.bicep" \
  "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" \
  "$CAPSULE_DIR/scripts/cleanup.sh" \
  "$CAPSULE_DIR/scripts/inject.sh" \
  "$CAPSULE_DIR/scripts/inject.ps1" \
  "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" \
  "$CAPSULE_DIR/tools/invoke-vm-investigation.sh" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-disk.sh" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-temp.sh" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-disk.ps1" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-temp.ps1"; do
  require_file "$path"
done

assert_contains "$CAPSULE_DIR/scenario.yaml" "platform: Azure Virtual Machines"
assert_contains "$CAPSULE_DIR/scenario.yaml" "alertModule: infra/bicep/modules/alert.bicep"
assert_contains "$CAPSULE_DIR/scenario.yaml" "bash: scripts/remediation/cleanup-disk.sh"
assert_contains "$CAPSULE_DIR/infra/bicep/main.bicep" "module scenarioAlert 'modules/alert.bicep'"
assert_contains "$CAPSULE_DIR/infra/bicep/main.bicep" "scopeResourceId: monitoring.outputs.logAnalyticsId"
assert_not_contains "$CAPSULE_DIR/infra/bicep/main.bicep" "scenario-alerts.bicep"
assert_contains "$CAPSULE_DIR/infra/bicep/main.bicep" "logAnalyticsResourceId: monitoring.outputs.logAnalyticsId"
assert_contains "$CAPSULE_DIR/infra/bicep/main.bicep" "output vmComputerNames array"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "var computerNames = ["
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "computerName: computerNames[i]"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "'sredisk01'"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "'sredisk02'"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "resource diskFreeSpaceDcr"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "resource diskFreeSpaceDcrAssociation"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "dataCollectionRuleId: diskFreeSpaceDcr.id"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "scope: vm[i]"
assert_contains "$CAPSULE_DIR/infra/bicep/modules/vm.bicep" "counterSpecifiers"
assert_contains "$CAPSULE_DIR/scripts/inject.sh" "diskfill.owner.json"
assert_contains "$CAPSULE_DIR/scripts/inject.ps1" "diskfill.owner.json"
assert_contains "$CAPSULE_DIR/scripts/inject.sh" "encodedCommand"
assert_contains "$CAPSULE_DIR/scripts/inject.ps1" "encodedCommand"
assert_contains "$CAPSULE_DIR/scripts/inject.sh" "finally {"
assert_contains "$CAPSULE_DIR/scripts/inject.ps1" "finally {"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-disk.sh" "Get-CimInstance Win32_Process"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-temp.sh" "Get-CimInstance Win32_Process"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-disk.ps1" "Get-CimInstance Win32_Process"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-temp.ps1" "Get-CimInstance Win32_Process"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-disk.sh" "Safe condition: process PID"
assert_contains "$CAPSULE_DIR/scripts/remediation/cleanup-temp.sh" "Safe condition: process PID"
for cleanup_script in \
  "$CAPSULE_DIR/scripts/remediation/cleanup-disk.sh" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-temp.sh" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-disk.ps1" \
  "$CAPSULE_DIR/scripts/remediation/cleanup-temp.ps1"; do
  assert_stale_pid_reuse_is_safe "$cleanup_script"
done
assert_contains "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" 'scripts/remediation/${ACTION}.sh'
assert_not_contains "$CAPSULE_DIR/tools/invoke-approved-remediation.sh" 'scenarios/*'
assert_contains "$CAPSULE_DIR/tools/invoke-vm-investigation.sh" 'investigation/query.kql'

export PATH="$FAKE_BIN:$PATH"
export AZ_CALL_LOG="$SCRATCH_DIR/az-calls.log"

case "$AUDIT_LOG" in
  "$SCRATCH_DIR"/*) ;;
  *) fail "audit log must be isolated under the test scratch directory" ;;
esac

if "$FIXTURE_DIR/scripts/cleanup.sh" --yes=false >"$SCRATCH_DIR/cleanup-invalid.out" 2>&1; then
  fail "--yes=false must be rejected; --yes is a boolean flag"
fi
[ ! -e "$AZ_CALL_LOG" ] || fail "invalid cleanup arguments must not call az"

"$FIXTURE_DIR/scripts/cleanup.sh" --yes >"$SCRATCH_DIR/cleanup.out" 2>&1
assert_contains "$AZ_CALL_LOG" "group delete --name rg-srelabdiskfull --yes --no-wait"

: > "$AZ_CALL_LOG"
if printf 'APPROVE\n' | "$FIXTURE_DIR/tools/invoke-approved-remediation.sh" \
  --action cleanup-disk --change-ticket BAD-123 >"$SCRATCH_DIR/ticket.out" 2>&1; then
  fail "invalid ticket must be rejected"
fi
[ ! -s "$AZ_CALL_LOG" ] || fail "invalid ticket must not execute remediation"
[ ! -e "$AUDIT_LOG" ] || fail "invalid ticket must not create an audit entry"

if printf 'approve\n' | "$FIXTURE_DIR/tools/invoke-approved-remediation.sh" \
  --action cleanup-disk --change-ticket CHG-123 >"$SCRATCH_DIR/nonapproval.out" 2>&1; then
  fail "non-exact approval must be rejected"
fi
[ ! -s "$AZ_CALL_LOG" ] || fail "nonapproval must not execute remediation"
[ ! -e "$AUDIT_LOG" ] || fail "nonapproval must not create an audit entry"

printf 'APPROVE\n' | "$FIXTURE_DIR/tools/invoke-approved-remediation.sh" \
  --action cleanup-disk --change-ticket INC-456 >"$SCRATCH_DIR/approval.out" 2>&1
assert_contains "$AZ_CALL_LOG" "vm run-command invoke --resource-group rg-srelabdiskfull --name srelabdiskfull-vm01"
require_file "$AUDIT_LOG"
assert_contains "$AUDIT_LOG" '"ticket":"INC-456"'
assert_contains "$AUDIT_LOG" '"action":"cleanup-disk"'
assert_contains "$AUDIT_LOG" '"status":"executed"'

if "$FIXTURE_DIR/tools/invoke-vm-investigation.sh" --scenario disk-full >"$SCRATCH_DIR/investigation.out" 2>&1; then
  fail "the local investigation tool must not accept a scenario selector"
fi

echo "PASS: disk-full capsule script tests"
