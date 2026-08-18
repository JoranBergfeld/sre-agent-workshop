#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/tools/invoke-approved-remediation.sh"
REMEDIATION="$ROOT/scripts/remediation/start-iis-app-pool.sh"

if [[ ! -x "$GATE" ]]; then
  echo "approval gate must exist and be executable: $GATE" >&2
  exit 1
fi

if [[ ! -x "$REMEDIATION" ]]; then
  echo "local remediation must exist and be executable: $REMEDIATION" >&2
  exit 1
fi

FIXTURE="$ROOT/output/.approval-gate-fixture-$$"
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE"/{bin,output,scripts/remediation,tools}

cp "$GATE" "$FIXTURE/tools/invoke-approved-remediation.sh"
cp "$REMEDIATION" "$FIXTURE/scripts/remediation/start-iis-app-pool.sh"

cat > "$FIXTURE/bin/az" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1 $2" == "account show" ]]; then
  if [[ " $* " == *" --query name "* ]]; then
    printf 'test-subscription\n'
  else
    printf '00000000-0000-0000-0000-000000000000\n'
  fi
fi
EOF

cat > "$FIXTURE/tools/invoke-vm-run-command.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$FIXTURE/run-command-arguments.txt"
EOF
chmod +x \
  "$FIXTURE/bin/az" \
  "$FIXTURE/tools/invoke-approved-remediation.sh" \
  "$FIXTURE/tools/invoke-vm-run-command.sh" \
  "$FIXTURE/scripts/remediation/start-iis-app-pool.sh"

export FIXTURE

run_gate() {
  printf '%s\n' "$1" | PATH="$FIXTURE/bin:$PATH" "$FIXTURE/tools/invoke-approved-remediation.sh" \
    --action start-iis-app-pool \
    --change-ticket CHG-12345 \
    --resource-group rg-test \
    --vm-name vm-test
}

if invalid_output=$(printf 'APPROVE\n' | "$FIXTURE/tools/invoke-approved-remediation.sh" \
  --action start-iis-app-pool \
  --change-ticket BAD \
  --resource-group rg-test \
  --vm-name vm-test 2>&1); then
  echo "invalid ticket unexpectedly succeeded" >&2
  exit 1
fi
if ! grep -Fq "ChangeTicket must match CHG-12345 or INC-12345." <<<"$invalid_output"; then
  echo "invalid ticket did not report the expected validation error" >&2
  exit 1
fi

if traversal_output=$(printf 'APPROVE\n' | "$FIXTURE/tools/invoke-approved-remediation.sh" \
  --action '../start-iis-app-pool' \
  --change-ticket CHG-12345 \
  --resource-group rg-test \
  --vm-name vm-test 2>&1); then
  echo "path traversal action unexpectedly succeeded" >&2
  exit 1
fi
if ! grep -Fq "Action must match lowercase kebab-case." <<<"$traversal_output"; then
  echo "path traversal action did not report the expected validation error" >&2
  exit 1
fi

if denied_output=$(run_gate "DENY" 2>&1); then
  echo "non-APPROVE input unexpectedly succeeded" >&2
  exit 1
fi
if ! grep -Fq "Remediation canceled. Explicit approval was not granted." <<<"$denied_output"; then
  echo "gate did not reject non-APPROVE input after resolving local remediation" >&2
  exit 1
fi

run_gate "APPROVE" >/dev/null

grep -Fq '"ticket":"CHG-12345"' "$FIXTURE/output/actions-audit.log"
grep -Fq '"action":"start-iis-app-pool"' "$FIXTURE/output/actions-audit.log"
grep -Fq '"status":"approved-attempted"' "$FIXTURE/output/actions-audit.log"
grep -Fq '"status":"succeeded"' "$FIXTURE/output/actions-audit.log"
grep -Fq -- '--resource-group rg-test --vm-name vm-test' "$FIXTURE/run-command-arguments.txt"

cat > "$FIXTURE/scripts/remediation/start-iis-app-pool.sh" <<'EOF'
#!/usr/bin/env bash
exit 17
EOF
chmod +x "$FIXTURE/scripts/remediation/start-iis-app-pool.sh"

set +e
run_gate "APPROVE" >/dev/null 2>&1
remediation_failure_status=$?
set -e
if [[ "$remediation_failure_status" -eq 0 ]]; then
  echo "failing remediation unexpectedly succeeded" >&2
  exit 1
fi
if [[ "$remediation_failure_status" -ne 17 ]]; then
  echo "failing remediation status was not preserved: $remediation_failure_status" >&2
  exit 1
fi

mapfile -t audit_statuses < <(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$FIXTURE/output/actions-audit.log")
expected_statuses=(approved-attempted succeeded approved-attempted failed)
if [[ "${audit_statuses[*]}" != "${expected_statuses[*]}" ]]; then
  echo "unexpected audit status order: ${audit_statuses[*]}" >&2
  exit 1
fi

cat > "$FIXTURE/scripts/remediation/start-iis-app-pool.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mv "$FIXTURE/output/actions-audit.log" "$FIXTURE/output/audit-before-terminal.log"
mkdir "$FIXTURE/output/actions-audit.log"
EOF
chmod +x "$FIXTURE/scripts/remediation/start-iis-app-pool.sh"

set +e
terminal_audit_output=$(run_gate "APPROVE" 2>&1)
terminal_audit_status=$?
set -e
if [[ "$terminal_audit_status" -eq 0 ]]; then
  echo "terminal audit failure unexpectedly succeeded" >&2
  exit 1
fi
if [[ "$terminal_audit_status" -ne 1 ]]; then
  echo "terminal audit failure returned unexpected status: $terminal_audit_status" >&2
  exit 1
fi
grep -Fq "Failed to write succeeded audit entry." <<<"$terminal_audit_output"
tail -n1 "$FIXTURE/output/audit-before-terminal.log" | grep -Fq '"status":"approved-attempted"'

echo "approval gate regression checks passed"
