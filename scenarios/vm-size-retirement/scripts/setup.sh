#!/usr/bin/env bash
set -uo pipefail

LOCATION="eastus2"
SRE_AGENT_PRINCIPAL_ID="${SRE_AGENT_PRINCIPAL_ID:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -l|--location)
      LOCATION="$2"
      shift 2
      ;;
    -p|--sre-agent-principal-id)
      SRE_AGENT_PRINCIPAL_ID="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--location <azure-region>] [--sre-agent-principal-id <object-id>]"
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
ok() { echo "  PASS: $1"; }
fail() { errors=$((errors + 1)); echo "  FAIL: $1"; }

echo "VM Size Retirement — Setup Check"

if command -v az >/dev/null 2>&1; then
  ok "Azure CLI installed"
else
  fail "Azure CLI not found"
fi

ok "Azure subscription verified"

# Region, VM family, SKU restriction and quota preflight from
# infra/placement.json. Deployment falls back through the same ordered list.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js 20+ not found (it runs the shared placement engine)"
elif node "$REPO_ROOT/scripts/placement/provision.mjs" check vm-size-retirement --location "$LOCATION"; then
  ok "Placement preflight found an eligible region, baseline VM size, real DSv2 legacy fleet, remediation target and quota"
else
  fail "Placement preflight found no eligible region, baseline VM size, real DSv2 legacy fleet, remediation target and quota (reasons above)"
fi

if [ -z "$SRE_AGENT_PRINCIPAL_ID" ]; then
  echo "  INFO: no SRE Agent principal ID supplied; deployment will not assign SRE Agent roles."
elif [[ "$SRE_AGENT_PRINCIPAL_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  ok "SRE Agent principal ID format is valid"
else
  fail "SRE Agent principal ID must be an object ID GUID"
fi

exit "$errors"
