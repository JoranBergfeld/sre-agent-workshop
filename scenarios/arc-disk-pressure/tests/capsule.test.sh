#!/usr/bin/env bash
set -euo pipefail

CAPSULE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$CAPSULE_DIR/scenario.yaml" ] || fail "scenario manifest is missing"
grep -Fq 'id: arc-disk-pressure' "$CAPSULE_DIR/scenario.yaml" || fail "manifest id is incorrect"
grep -Fq 'platform: Azure Arc-enabled Servers' "$CAPSULE_DIR/scenario.yaml" || fail "manifest platform is incorrect"
grep -Fq 'action: cleanup-arc-disk-pressure' "$CAPSULE_DIR/scenario.yaml" || fail "Arc remediation action is missing"
grep -Fq 'targetFreePercent = 8' "$CAPSULE_DIR/scripts/inject.sh" || fail "bounded injection target is missing"
grep -Fq 'minimumFreeBytes = 2GB' "$CAPSULE_DIR/scripts/inject.sh" || fail "disk safety reserve is missing"
grep -Fq 'Microsoft.HybridCompute/machines/runCommands/write' "$CAPSULE_DIR/knowledge/operational-guidelines.md" || fail "Run Command permission boundary is missing"
grep -Fq 'connectedmachine extension create' "$CAPSULE_DIR/scripts/onboard-arc.sh" ||
  fail "Arc onboarding does not install Azure Monitor Agent through Arc"
grep -Fq 'data-collection rule association create' "$CAPSULE_DIR/scripts/onboard-arc.sh" ||
  fail "Arc onboarding does not associate the disk telemetry DCR with the Arc machine"
grep -Fq -- "--resource-name '\$VM_NAME'" "$CAPSULE_DIR/scripts/onboard-arc.sh" ||
  fail "Arc onboarding does not preserve the documented machine name"
grep -Fq -- "--resource-name '\$VmName'" "$CAPSULE_DIR/scripts/onboard-arc.ps1" ||
  fail "PowerShell Arc onboarding does not preserve the documented machine name"
if grep -Fq "resource amaExtension 'Microsoft.Compute/virtualMachines/extensions" "$CAPSULE_DIR/infra/bicep/modules/vm.bicep"; then
  fail "Azure Monitor Agent must be managed through Arc, not the evaluation Azure VM"
fi
[ -x "$CAPSULE_DIR/scripts/setup.sh" ] || fail "setup script is not executable"
[ -x "$CAPSULE_DIR/scripts/inject.sh" ] || fail "inject script is not executable"
[ -x "$CAPSULE_DIR/scripts/validate.sh" ] || fail "validate script is not executable"
[ -x "$CAPSULE_DIR/scripts/cleanup.sh" ] || fail "cleanup script is not executable"
[ -x "$CAPSULE_DIR/scripts/remediation/cleanup-arc-disk-pressure.sh" ] || fail "remediation script is not executable"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
cat >"$test_dir/az" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$AZ_CALL_LOG"
case "$*" in
  "account show"*) exit 0 ;;
  "connectedmachine show"*) printf 'eastus2\n' ;;
  "connectedmachine run-command create"*)
    cat <<'JSON'
{"instanceView":{"executionState":"Succeeded","exitCode":0,"output":"","error":"PowerShell command failed"}}
JSON
    ;;
  "connectedmachine run-command delete"*) exit 0 ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$test_dir/az"

export AZ_CALL_LOG="$test_dir/az-calls.log"
if PATH="$test_dir:$PATH" "$CAPSULE_DIR/tools/invoke-arc-run-command.sh" \
  --resource-group test-rg \
  --machine-name test-machine \
  --script 'Write-Error "failed"' >"$test_dir/output.log" 2>&1; then
  fail "Arc Run Command wrapper accepted a non-empty instanceView error"
fi
grep -Fq 'PowerShell command failed' "$test_dir/output.log" ||
  fail "Arc Run Command wrapper did not surface the instanceView error"
grep -Eq 'connectedmachine run-command delete .*--no-wait' "$AZ_CALL_LOG" ||
  fail "Arc Run Command wrapper waits synchronously for command deletion"

echo "Arc disk-pressure capsule test passed."
