#!/usr/bin/env bash
set -euo pipefail

LOCATION="eastus2"
WORKLOAD="srelabapp"
PUBLISH_DIR=""
UPSTREAM_REPOSITORY="JoranBergfeld/sre-agent-workshop"

usage() {
  cat <<'EOF'
Usage: setup.sh [-l|--location <region>] [-w|--workload <name>] [-s|--subscription-id <id>]

Options:
  -l, --location  Azure region (default: eastus2)
  -w, --workload  Workload name (default: srelabapp)
  -s, --subscription-id  Azure subscription ID (default: AZURE_SUBSCRIPTION_ID or active subscription)
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

for required_command in az gh dotnet zip jq; do
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

for provider in \
  Microsoft.Web \
  Microsoft.Insights \
  Microsoft.OperationalInsights; do
  az provider register --namespace "$provider" --wait --output none
done

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags workshop=sre-agent environment=demo \
  --output none

LEGACY_IDENTITY_NAME="$WORKLOAD-github-deploy"
LEGACY_PRINCIPAL_ID=""
MANAGED_IDENTITY_STATE=$(az provider show \
  --namespace Microsoft.ManagedIdentity \
  --query registrationState \
  --output tsv)
if [ "$MANAGED_IDENTITY_STATE" = "Registered" ]; then
  LEGACY_PRINCIPAL_ID=$(az identity list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name=='$LEGACY_IDENTITY_NAME'].principalId | [0]" \
    --output tsv)
fi

if [ -n "$LEGACY_PRINCIPAL_ID" ]; then
  RESOURCE_GROUP_ID=$(az group show \
    --name "$RESOURCE_GROUP" \
    --query id \
    --output tsv)
  WEBSITE_CONTRIBUTOR_ROLE_ID="/subscriptions/$active_subscription_id/providers/Microsoft.Authorization/roleDefinitions/de139f84-1756-47ae-9be6-808fbbe84772"
  LEGACY_ROLE_ASSIGNMENT_IDS=$(az role assignment list \
    --assignee-object-id "$LEGACY_PRINCIPAL_ID" \
    --scope "$RESOURCE_GROUP_ID" \
    --role "$WEBSITE_CONTRIBUTOR_ROLE_ID" \
    --query '[].id' \
    --output tsv)

  if [ -n "$LEGACY_ROLE_ASSIGNMENT_IDS" ]; then
    # Azure resource IDs contain no shell whitespace.
    # shellcheck disable=SC2086
    az role assignment delete --ids $LEGACY_ROLE_ASSIGNMENT_IDS
  fi

  az identity delete \
    --resource-group "$RESOURCE_GROUP" \
    --name "$LEGACY_IDENTITY_NAME" \
    --output none
  echo "Removed legacy GitHub deployment identity: $LEGACY_IDENTITY_NAME"
fi

OUTPUTS=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file scenarios/cloud-agent-handover/infra/bicep/main.bicep \
  --parameters \
    location="$LOCATION" \
    workloadName="$WORKLOAD" \
  --query properties.outputs \
  --output json)

WEB_APP=$(jq -er '.webAppName.value' <<<"$OUTPUTS")
WEB_HOST=$(jq -er '.webAppHostName.value' <<<"$OUTPUTS")

PUBLISH_DIR=$(mktemp -d)
trap cleanup_temp EXIT

dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
  --configuration Release \
  --output "$PUBLISH_DIR/publish"
(cd "$PUBLISH_DIR/publish" && zip -qr "$PUBLISH_DIR/app.zip" .)

az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$PUBLISH_DIR/app.zip" \
  --type zip \
  --output none

gh variable set AZURE_RESOURCE_GROUP --repo "$REPOSITORY" --body "$RESOURCE_GROUP"
gh variable set AZURE_WEBAPP_NAME --repo "$REPOSITORY" --body "$WEB_APP"
gh variable set AZURE_LOCATION --repo "$REPOSITORY" --body "$LOCATION"
gh variable set WORKLOAD_NAME --repo "$REPOSITORY" --body "$WORKLOAD"

EXISTING_VARIABLES=$(gh variable list \
  --repo "$REPOSITORY" \
  --json name \
  --jq '.[].name')
for legacy_variable in \
  AZURE_CLIENT_ID \
  AZURE_TENANT_ID \
  AZURE_SUBSCRIPTION_ID; do
  if grep -Fxq "$legacy_variable" <<<"$EXISTING_VARIABLES"; then
    gh variable delete "$legacy_variable" --repo "$REPOSITORY"
  fi
done

echo "Application: https://$WEB_HOST"
echo "Health:      https://$WEB_HOST/health"
echo "Repository:  $REPOSITORY"
