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
[ -x "$CAPSULE_DIR/scripts/setup.sh" ] || fail "setup script is not executable"
[ -x "$CAPSULE_DIR/scripts/inject.sh" ] || fail "inject script is not executable"
[ -x "$CAPSULE_DIR/scripts/validate.sh" ] || fail "validate script is not executable"
[ -x "$CAPSULE_DIR/scripts/cleanup.sh" ] || fail "cleanup script is not executable"
[ -x "$CAPSULE_DIR/scripts/remediation/cleanup-arc-disk-pressure.sh" ] || fail "remediation script is not executable"

echo "Arc disk-pressure capsule test passed."
