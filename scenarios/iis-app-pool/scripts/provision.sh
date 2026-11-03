#!/usr/bin/env bash
# Provision iis-app-pool infrastructure with bounded, policy-driven region and VM
# family fallback (infra/placement.json). Existing deployments stay pinned to
# their region. Options: scripts/placement/provision.mjs --help
set -euo pipefail

SCENARIO="iis-app-pool"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENGINE="$REPO_ROOT/scripts/placement/provision.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20 or later is required (it runs the shared placement engine)." >&2
  exit 1
fi
case "${1:-}" in
  -h|--help) exec node "$ENGINE" --help ;;
esac

if [[ -z "${VM_ADMIN_PASSWORD:-}" ]]; then
  if [[ -t 0 ]]; then
    read -rsp "Windows VM admin password: " VM_ADMIN_PASSWORD
    echo
    export VM_ADMIN_PASSWORD
  else
    echo "ERROR: set VM_ADMIN_PASSWORD (it is passed to Azure through a private temporary file, never on the command line)." >&2
    exit 1
  fi
fi

exec node "$ENGINE" deploy "$SCENARIO" --secure-param-env adminPassword=VM_ADMIN_PASSWORD "$@"
