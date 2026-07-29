#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docs=(
  "$ROOT/README.md"
  "$ROOT/knowledge/operational-guidelines.md"
  "$ROOT/docs/02-configure-incident-response.md"
  "$ROOT/docs/04-onboard-sre-agent.md"
  "$ROOT/docs/90-watch-agent-workflow.md"
)

for doc in "${docs[@]}"; do
  grep -Fq 'CHG-' "$doc"
  grep -Fq 'INC-' "$doc"
  grep -Fq 'APPROVE' "$doc"
  grep -qi 'audit' "$doc"
done

if grep -Eqi '@copilot|copilot pr|pull request|github issue' "${docs[@]}"; then
  echo "VM remediation documentation must not substitute a Copilot PR for the approval gate." >&2
  exit 1
fi

echo "VM remediation documentation regression checks passed"
