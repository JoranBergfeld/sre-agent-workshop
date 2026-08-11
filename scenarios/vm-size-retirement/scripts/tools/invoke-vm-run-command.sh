#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP=""
VM_NAME=""
SCRIPT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -n|--vm-name) VM_NAME="$2"; shift 2 ;;
    -s|--script) SCRIPT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --resource-group <rg> --vm-name <vm> --script <powershell-script>"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"; [ -z "$requested_subscription_id" ] || az account set --subscription "$requested_subscription_id" || { echo "Unable to select Azure subscription '$requested_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }
active_subscription_id=$(az account show --query id -o tsv) || { echo "Azure CLI is not authenticated. Run 'az login'." >&2; exit 1; }; active_subscription_name=$(az account show --query name -o tsv) || exit 1
[ -n "$active_subscription_id" ] && [ -n "$active_subscription_name" ] || { echo "Unable to read the active Azure subscription." >&2; exit 1; }
[ -z "$requested_subscription_id" ] || [ "$active_subscription_id" = "$requested_subscription_id" ] || { echo "Azure subscription mismatch: requested '$requested_subscription_id', active '$active_subscription_id'. Run: az account set --subscription \"$requested_subscription_id\"" >&2; exit 1; }; echo "Azure subscription: $active_subscription_name ($active_subscription_id)"
if [ -z "$RESOURCE_GROUP" ] || [ -z "$VM_NAME" ] || [ -z "$SCRIPT" ]; then
  echo "Usage: $0 --resource-group <rg> --vm-name <vm> --script <powershell-script>" >&2
  exit 2
fi

for tool in az iconv base64 jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required tool '$tool' is not installed." >&2
    exit 1
  fi
done

ENCODED_SCRIPT=$(printf '%s' "$SCRIPT" | iconv -f UTF-8 -t UTF-16LE | base64 -w 0)
WRAPPER_LINE="powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $ENCODED_SCRIPT"
if ! RESULT_JSON=$(az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunPowerShellScript \
  --scripts "$WRAPPER_LINE" \
  -o json); then
  echo "Failed to run command on VM '$VM_NAME'." >&2
  exit 1
fi

STDOUT=$(printf '%s' "$RESULT_JSON" | jq -r '[.value[] | select(.code | test("ComponentStatus/StdOut"))][0].message // ""')
STDERR=$(printf '%s' "$RESULT_JSON" | jq -r '[.value[] | select(.code | test("ComponentStatus/StdErr"))][0].message // ""')

if [ -n "$(printf '%s' "$STDERR" | tr -d '[:space:]')" ] && printf '%s' "$STDERR" | grep -Eq 'CategoryInfo|FullyQualifiedErrorId|ParserError|Exception'; then
  echo "VM command returned stderr: $STDERR" >&2
  exit 1
fi

if [ -n "$(printf '%s' "$STDOUT" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$STDOUT"
else
  echo "VM command completed with no stdout output."
fi
