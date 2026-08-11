#!/usr/bin/env bash
# Pre-workshop validation — checks that required tools and config are in place.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOCATION="${LOCATION:-eastus2}"
SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--subscription-id <id>] [--location <region>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

export AZURE_SUBSCRIPTION_ID="$SUBSCRIPTION_ID"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

PASS="✅"
FAIL="❌"
WARN="⚠️ "
errors=0

header() { echo -e "\n── $1 ──"; }
ok()     { echo "  ${PASS} $1"; }
fail()   { echo "  ${FAIL} $1"; errors=$((errors + 1)); }
warn()   { echo "  ${WARN} $1"; }

echo "========================================"
echo "  SRE Agent Workshop — Setup Check"
echo "========================================"

# ── Azure CLI ──────────────────────────────
header "Azure CLI"
if command -v az &>/dev/null; then
  ok "az CLI installed ($(az version --query '\"azure-cli\"' -o tsv 2>/dev/null || echo 'unknown'))"
else
  fail "az CLI not found — install: https://aka.ms/install-azure-cli"
fi

# ── Azure login ────────────────────────────
header "Azure Authentication"
if az account show &>/dev/null; then
  ACCOUNT=$(az account show --query '{name:name, id:id}' -o tsv 2>/dev/null)
  ok "Logged in — ${ACCOUNT}"
else
  fail "Not logged in — run: az login"
fi

# ── Azure subscription ────────────────────
header "Azure Subscription"
if az account show &>/dev/null; then
  SUB_ID=$(az account show --query id -o tsv)
  ok "Subscription: ${SUB_ID}"
else
  fail "No active subscription"
fi

# ── Resource Providers ─────────────────────
header "Azure Resource Providers"
if az account show &>/dev/null; then
  REQUIRED_PROVIDERS=(
    "Microsoft.ContainerService"
    "Microsoft.DocumentDB"
    "Microsoft.OperationalInsights"
    "Microsoft.Insights"
    "Microsoft.ManagedIdentity"
    "Microsoft.OperationsManagement"
  )
  for ns in "${REQUIRED_PROVIDERS[@]}"; do
    STATE=$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo "Unknown")
    if [ "$STATE" = "Registered" ]; then
      ok "$ns — Registered"
    else
      fail "$ns — ${STATE}"
      echo "       Register with: az provider register --namespace $ns"
    fi
  done
else
  warn "Skipped — not logged in to Azure"
fi

# ── kubectl ────────────────────────────────
header "kubectl"
if command -v kubectl &>/dev/null; then
  ok "kubectl installed ($(kubectl version --client --short 2>/dev/null || kubectl version --client -o yaml 2>/dev/null | head -1))"
else
  fail "kubectl not found — install: https://kubernetes.io/docs/tasks/tools/"
fi

# ── GitHub CLI (optional) ─────────────────
header "GitHub CLI"
if command -v gh &>/dev/null; then
  ok "gh CLI installed ($(gh --version | head -1))"
else
  warn "gh CLI not found (optional) — install: https://cli.github.com"
fi

# ── Region check ──────────────────────────
header "Supported Regions"
echo "  The workshop supports: eastus2, swedencentral, australiaeast"
echo "  Set your preferred region when running the deploy-infra workflow."

# ── VM Size availability ─────────────────
header "VM Size Availability"
VM_SIZE="Standard_D2ads_v6"
if az account show &>/dev/null; then
  AVAILABLE=$(az vm list-sizes --location "$LOCATION" --query "[?name=='${VM_SIZE}'].name" -o tsv 2>/dev/null)
  if [ -n "$AVAILABLE" ]; then
    ok "${VM_SIZE} is available in ${LOCATION}"
  else
    fail "${VM_SIZE} is NOT available in ${LOCATION}"
    echo ""
    echo "  The default AKS node VM size (${VM_SIZE}) is not available in your"
    echo "  subscription/region. You need to edit scenarios/workload-identity-break/infra/bicep/modules/aks.bicep"
    echo "  and change the 'vmSize' property to an available 2-vCPU size."
    echo ""
    echo "  Suggested alternatives (any 2-vCPU general-purpose VM will work):"
    echo "    - Standard_D2s_v3"
    echo "    - Standard_D2as_v5"
    echo "    - Standard_D2s_v5"
    echo "    - Standard_B2s"
    echo ""
    echo "  To see all available sizes in your region:"
    echo "    az vm list-sizes --location ${LOCATION} --query \"[?numberOfCores==\`2\`].name\" -o table"
  fi
else
  warn "Skipped — not logged in to Azure"
fi

# ── Summary ───────────────────────────────
echo ""
echo "========================================"
if [ "$errors" -eq 0 ]; then
  echo "  All checks passed — you're ready! 🚀"
else
  echo "  ${errors} issue(s) found — please fix before starting."
fi
echo "========================================"
exit "$errors"
