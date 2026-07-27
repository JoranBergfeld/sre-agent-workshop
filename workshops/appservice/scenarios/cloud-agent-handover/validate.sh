#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -a|--app-name) WEB_APP="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list --resource-group "$RESOURCE_GROUP" --query '[0].name' -o tsv)
fi

if [ -z "$WEB_APP" ]; then
  echo "No web app found in $RESOURCE_GROUP" >&2
  exit 1
fi

HOST=$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP" --query defaultHostName -o tsv)
BODY="${PWD}/.cloud-agent-handover-response.$$"
trap 'rm -f "$BODY"' EXIT
CODE=$(curl -sS -o "$BODY" -w '%{http_code}' -X POST "https://$HOST/api/feature" || true)

if [ "$CODE" != "200" ]; then
  echo "Degraded: POST /api/feature returned HTTP $CODE" >&2
  exit 1
fi

if ! jq -e '
  .status == "completed" and
  .message == "The unfinished feature is now implemented."
' "$BODY" >/dev/null; then
  echo "Degraded: POST /api/feature returned an unexpected response contract" >&2
  exit 1
fi

echo "Healthy: POST /api/feature returned the implemented HTTP 200 contract."
