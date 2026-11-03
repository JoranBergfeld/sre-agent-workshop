#!/usr/bin/env bash
set -euo pipefail

LOCATION="eastus2"
WORKLOAD="srelabapp"
PUBLISH_DIR=""
UPSTREAM_REPOSITORY="JoranBergfeld/sre-agent-workshop"
REGION_FALLBACK_ARGS=()
LOCAL_BUILD=false

usage() {
  cat <<'EOF'
Usage: setup.sh [-l|--location <region>] [-w|--workload <name>] [-s|--subscription-id <id>] [--no-region-fallback] [--local-build]

The resource group rg-<workload> must already exist (create it with
'az group create --name rg-<workload> --location <region>'); setup never
creates, relocates, or deletes resource groups.

Options:
  -l, --location  Preferred Azure region (default: eastus2). A new deployment
                  falls back through infra/placement.json when the region lacks
                  App Service capacity or quota; an existing one stays pinned.
      --no-region-fallback  Only try the preferred region
  -w, --workload  Workload name (default: srelabapp)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
      --local-build  Test and publish the app locally (needs dotnet and zip)
                  instead of deploying the verified build artifact for the
                  current commit from this repository's Actions
  -h, --help      Show this help
EOF
}

require_option_value() {
  local option="$1"
  local value="${2:-}"

  if [ -z "$value" ] || [[ "$value" == -* ]]; then
    echo "Missing value for $option." >&2
    usage >&2
    exit 2
  fi
}

cleanup_temp() {
  if [ -n "$PUBLISH_DIR" ] && [ -d "$PUBLISH_DIR" ]; then
    rm -rf -- "$PUBLISH_DIR"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -l|--location)
      require_option_value "$1" "${2:-}"
      LOCATION="$2"
      shift 2
      ;;
    -w|--workload)
      require_option_value "$1" "${2:-}"
      WORKLOAD="$2"
      shift 2
      ;;
    -s|--subscription-id)
      require_option_value "$1" "${2:-}"
      export AZURE_SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    --no-region-fallback)
      REGION_FALLBACK_ARGS=(--no-region-fallback)
      shift
      ;;
    --local-build)
      LOCAL_BUILD=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$LOCATION" in
  eastus2|swedencentral|australiaeast) ;;
  *)
    echo "Unsupported SRE Agent region: $LOCATION" >&2
    exit 1
    ;;
esac

if [[ ! "$WORKLOAD" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [ "${#WORKLOAD}" -gt 51 ]; then
  echo "Workload name must be 1-51 lowercase letters, numbers, or internal hyphens." >&2
  exit 1
fi

REQUIRED_COMMANDS=(az gh node)
if [ "$LOCAL_BUILD" = true ]; then REQUIRED_COMMANDS+=(dotnet zip); fi
for required_command in "${REQUIRED_COMMANDS[@]}"; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ] && ! az account set --subscription "$requested_subscription_id"; then echo "Unable to select Azure subscription '$requested_subscription_id'. Run 'az login', then run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
active_subscription_id=$(az account show --query id --output tsv) || { echo "Azure CLI is not authenticated. Run 'az login' and try again." >&2; exit 1; }
active_subscription_name=$(az account show --query name --output tsv) || { echo "Unable to read the active Azure subscription name." >&2; exit 1; }
if [ -z "$active_subscription_id" ] || [ -z "$active_subscription_name" ]; then echo "Unable to read the active Azure subscription. Run 'az login' and try again." >&2; exit 1; fi
if [ -n "$requested_subscription_id" ] && [ "$active_subscription_id" != "$requested_subscription_id" ]; then echo "Azure subscription mismatch: requested '$requested_subscription_id', but active subscription is '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; fi
echo "Azure subscription: $active_subscription_name ($active_subscription_id)"

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run 'gh auth login' and try again." >&2
  exit 1
fi

cd "$REPO_ROOT"

if ! REPOSITORY=$(gh repo view --json nameWithOwner --jq .nameWithOwner); then
  echo "Unable to resolve the current GitHub repository." >&2
  exit 1
fi

if [[ "$REPOSITORY" != */* ]] || [ -z "${REPOSITORY%%/*}" ] || [ -z "${REPOSITORY#*/}" ]; then
  echo "GitHub repository must be in owner/name format; received: $REPOSITORY" >&2
  exit 1
fi

IS_TEMPLATE=$(gh api "repos/$REPOSITORY" --jq .is_template)
if [ "$REPOSITORY" = "$UPSTREAM_REPOSITORY" ] || [ "$IS_TEMPLATE" = "true" ]; then
  echo "Use the template, clone the generated repository, and run setup in the generated repository." >&2
  exit 1
fi

OWNER="${REPOSITORY%%/*}"
NAME="${REPOSITORY#*/}"
GRAPHQL_QUERY='
query($owner:String!, $name:String!) {
  repository(owner:$owner, name:$name) {
    suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:100) {
      nodes { login }
    }
  }
}'
ACTORS=$(gh api graphql \
  -f query="$GRAPHQL_QUERY" \
  -f owner="$OWNER" \
  -f name="$NAME" \
  --jq '.data.repository.suggestedActors.nodes[].login')

if ! grep -Fxq 'copilot-swe-agent' <<<"$ACTORS"; then
  echo "Copilot coding agent is not assignable in $REPOSITORY. Enable it before setup." >&2
  exit 1
fi

RESOURCE_GROUP="rg-$WORKLOAD"

json_field() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{let v=JSON.parse(d);for(const k of process.argv[1].split("."))v=v?.[k];if(typeof v!=="string"||!v){process.exit(1)}process.stdout.write(v)})' "$1"
}

# Read-only ownership/eligibility check before anything is changed: the
# designated resource group must already exist and be empty or owned by this
# scenario, and an existing deployment stays pinned to its region and SKU.
if ! node scripts/placement/provision.mjs check cloud-agent-handover \
  --location "$LOCATION" "${REGION_FALLBACK_ARGS[@]}" \
  --workload "$WORKLOAD" \
  --resource-group "$RESOURCE_GROUP" \
  --require-group; then
  echo "Setup stopped before changing anything." >&2
  exit 1
fi

PUBLISH_DIR=$(mktemp -d)
trap cleanup_temp EXIT

if [ "$LOCAL_BUILD" = true ]; then
  dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
  dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
    --configuration Release \
    --output "$PUBLISH_DIR/publish"
  (cd "$PUBLISH_DIR/publish" && zip -qr "$PUBLISH_DIR/app.zip" .)
  PACKAGE="$PUBLISH_DIR/app.zip"
  PACKAGE_SOURCE="local build of the current checkout"
else
  # Exact-commit, provenance- and checksum-verified ZIP from this repository's
  # successful 'Validate Cloud Agent Handover Application' run.
  if ! ARTIFACT=$(node scripts/build-artifacts/resolve.mjs \
    --scenario cloud-agent-handover \
    --variant application \
    --output-dir "$PUBLISH_DIR" \
    --repo "$REPOSITORY"); then
    echo "Setup stopped before changing anything. Dispatch the build shown above, wait for it to succeed, and rerun setup; or rerun with --local-build." >&2
    exit 1
  fi
  PACKAGE=$(json_field deploymentZip <<<"$ARTIFACT")
  PACKAGE_SOURCE="build artifact for commit $(json_field sourceSha <<<"$ARTIFACT")"
fi

# Earlier versions created a '<workload>-github-deploy' identity and AZURE_*
# repository variables. They are never deleted automatically: they may belong
# to another deployment or still be in use. Report them for manual review.
LEGACY_IDENTITY_NAME="$WORKLOAD-github-deploy"
LEGACY_GUIDANCE=()
MANAGED_IDENTITY_STATE=$(az provider show \
  --namespace Microsoft.ManagedIdentity \
  --query registrationState \
  --output tsv)
if [ "$MANAGED_IDENTITY_STATE" = "Registered" ]; then
  LEGACY_PRINCIPAL_ID=$(az identity list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='$LEGACY_IDENTITY_NAME'].principalId | [0]" \
    --output tsv)
  if [ -n "$LEGACY_PRINCIPAL_ID" ]; then
    LEGACY_GUIDANCE+=(
      "Legacy identity $LEGACY_IDENTITY_NAME exists in $RESOURCE_GROUP. If nothing uses it, remove it and its role assignments manually:"
      "  az role assignment delete --assignee $LEGACY_PRINCIPAL_ID --role \"Website Contributor\" --resource-group $RESOURCE_GROUP"
      "  az identity delete --resource-group $RESOURCE_GROUP --name $LEGACY_IDENTITY_NAME"
    )
  fi
fi
EXISTING_VARIABLES=$(gh variable list \
  --repo "$REPOSITORY" \
  --json name \
  --jq '.[].name')
for legacy_variable in \
  AZURE_CLIENT_ID \
  AZURE_TENANT_ID \
  AZURE_SUBSCRIPTION_ID; do
  if grep -Fxq "$legacy_variable" <<<"$EXISTING_VARIABLES"; then
    LEGACY_GUIDANCE+=("Legacy repository variable $legacy_variable is unused by this scenario. If nothing else uses it: gh variable delete $legacy_variable --repo $REPOSITORY")
  fi
done

for provider in \
  Microsoft.Web \
  Microsoft.Insights \
  Microsoft.OperationalInsights; do
  az provider register --namespace "$provider" --wait --output none
done

# The shared placement engine deploys infra/bicep/main.bicep into the
# designated resource group in the first eligible region (App Service Linux
# B1, providers and quota), retrying only classified capacity/SKU/quota
# failures that are proven non-mutating. An existing deployment is never
# relocated, and resources are never deleted automatically.
OUTPUTS_FILE=$(mktemp)
node scripts/placement/provision.mjs deploy cloud-agent-handover \
  --location "$LOCATION" "${REGION_FALLBACK_ARGS[@]}" \
  --workload "$WORKLOAD" \
  --resource-group "$RESOURCE_GROUP" \
  --outputs-file "$OUTPUTS_FILE"
OUTPUTS=$(cat "$OUTPUTS_FILE")
rm -f -- "$OUTPUTS_FILE"
LOCATION=$(json_field location < .sre-workshop/cloud-agent-handover-placement.json)
echo "Azure region: $LOCATION"

WEB_APP=$(json_field webAppName.value <<<"$OUTPUTS")
WEB_HOST=$(json_field webAppHostName.value <<<"$OUTPUTS")

az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$PACKAGE" \
  --type zip \
  --output none
echo "Deployed $PACKAGE_SOURCE."

gh variable set AZURE_RESOURCE_GROUP --repo "$REPOSITORY" --body "$RESOURCE_GROUP"
gh variable set AZURE_WEBAPP_NAME --repo "$REPOSITORY" --body "$WEB_APP"
gh variable set AZURE_LOCATION --repo "$REPOSITORY" --body "$LOCATION"
gh variable set WORKLOAD_NAME --repo "$REPOSITORY" --body "$WORKLOAD"

for line in "${LEGACY_GUIDANCE[@]}"; do
  echo "$line"
done

echo "Application: https://$WEB_HOST"
echo "Health:      https://$WEB_HOST/health"
echo "Repository:  $REPOSITORY"
