#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: cleanup.sh [resource-group]"
}

if [ "$#" -gt 1 ]; then
  echo "Unknown argument: $2" >&2
  usage >&2
  exit 2
fi

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Required command not found: az" >&2
  exit 1
fi

RESOURCE_GROUP="${1:-${AZURE_RESOURCE_GROUP:-rg-srelabapp}}"
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started for $RESOURCE_GROUP."
