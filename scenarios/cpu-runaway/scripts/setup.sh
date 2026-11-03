#!/usr/bin/env bash
set -uo pipefail

LOCATION="eastus2"
while [ $# -gt 0 ]; do
  case "$1" in
    -l|--location)
      LOCATION="$2"
      shift 2
      ;;
    --location=*)
      LOCATION="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [-l|--location <azure-region>]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

errors=0
write_ok()   { echo "  ✅ $1"; }
write_fail() { errors=$((errors + 1)); echo "  ❌ $1"; }

echo "========================================"
echo "  CPU Runaway Scenario — Setup Check"
echo "========================================"

if command -v az >/dev/null 2>&1; then
  write_ok "Azure CLI installed"
else
  write_fail "Azure CLI not found"
fi

if command -v gh >/dev/null 2>&1; then
  write_ok "GitHub CLI installed"
else
  write_ok "GitHub CLI optional and not installed"
fi

write_ok "Azure subscription verified"

# Region, VM family, SKU restriction and quota preflight from
# infra/placement.json. Deployment falls back through the same ordered list.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  write_fail "Node.js 20+ not found (it runs the shared placement engine)"
elif node "$REPO_ROOT/scripts/placement/provision.mjs" check cpu-runaway --location "$LOCATION"; then
  write_ok "Placement preflight found an eligible region, VM size and quota"
else
  write_fail "Placement preflight found no eligible region, VM size or quota (reasons above)"
fi

echo "========================================"
if [ "$errors" -eq 0 ]; then
  echo "  All checks passed."
else
  echo "  $errors issue(s) detected."
fi
echo "========================================"
exit "$errors"
