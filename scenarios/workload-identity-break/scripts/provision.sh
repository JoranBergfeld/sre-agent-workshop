#!/usr/bin/env bash
# Provision workload-identity-break infrastructure with bounded, policy-driven region and VM
# family fallback (infra/placement.json). Existing deployments stay pinned to
# their region. Options: scripts/placement/provision.mjs --help
set -euo pipefail

SCENARIO="workload-identity-break"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENGINE="$REPO_ROOT/scripts/placement/provision.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20 or later is required (it runs the shared placement engine)." >&2
  exit 1
fi
case "${1:-}" in
  -h|--help) exec node "$ENGINE" --help ;;
esac

exec node "$ENGINE" deploy "$SCENARIO" "$@"
