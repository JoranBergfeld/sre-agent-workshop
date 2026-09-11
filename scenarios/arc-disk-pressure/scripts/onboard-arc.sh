#!/usr/bin/env bash
# Onboard the disposable evaluation VM as an Azure Arc-enabled server.
#
# EVALUATION AND TESTING ONLY. Onboarding an Azure VM to Azure Arc requires
# Microsoft's MSFT_ARC_TEST flag and is explicitly not supported for
# production. Only host placement is simulated: Arc registration, Resource
# Graph connectivity state, and Arc Run Command behaviour are real.
set -euo pipefail

RESOURCE_GROUP="rg-srelabarcdisk"
VM_NAME="srelabarcdisk-vm01"
LOCATION="eastus2"
DCR_NAME=""

while [ $# -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -v|--vm-name) VM_NAME="$2"; shift 2 ;;
    -l|--location) LOCATION="$2"; shift 2 ;;
    --dcr-name) DCR_NAME="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--resource-group <rg>] [--vm-name <vm>] [--location <region>] [--dcr-name <name>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

requested_subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [ -n "$requested_subscription_id" ]; then
  az account set --subscription "$requested_subscription_id"
fi
SUBSCRIPTION_ID=$(az account show --query id -o tsv) || {
  echo "Azure CLI is not authenticated. Run 'az login'." >&2
  exit 1
}
TENANT_ID=$(az account show --query tenantId -o tsv)

state=$(az provider show -n Microsoft.HybridCompute --query registrationState -o tsv 2>/dev/null || echo "NotRegistered")
if [ "$state" != "Registered" ]; then
  echo "Microsoft.HybridCompute is '$state'. Run: az provider register -n Microsoft.HybridCompute" >&2
  exit 1
fi

echo "Requesting a short-lived ARM access token for Arc onboarding ..."
ACCESS_TOKEN=$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)
[ -n "$ACCESS_TOKEN" ] || { echo "Unable to acquire an ARM access token." >&2; exit 1; }

read -r -d '' ONBOARD_SCRIPT <<PWSH || true
\$ErrorActionPreference = 'Stop'
\$ProgressPreference = 'SilentlyContinue'

# Evaluation-only flag: Azure VMs refuse Arc onboarding without it.
[Environment]::SetEnvironmentVariable('MSFT_ARC_TEST', 'true', 'Machine')
\$env:MSFT_ARC_TEST = 'true'

\$agent = Join-Path \$env:ProgramFiles 'AzureConnectedMachineAgent\azcmagent.exe'
if (-not (Test-Path \$agent)) {
  \$installer = Join-Path \$env:TEMP 'install_windows_azcmagent.ps1'
  Invoke-WebRequest -Uri 'https://aka.ms/azcmagent-windows' -TimeoutSec 120 -OutFile \$installer
  & \$installer
}
if (-not (Test-Path \$agent)) { throw 'Azure Connected Machine agent installation failed.' }

\$status = & \$agent show --json | ConvertFrom-Json
if (\$status.status -eq 'Connected') {
  Write-Output ('Already connected as {0}' -f \$status.resourceName)
  exit 0
}

& \$agent connect \`
  --access-token '$ACCESS_TOKEN' \`
  --subscription-id '$SUBSCRIPTION_ID' \`
  --resource-group '$RESOURCE_GROUP' \`
  --resource-name '$VM_NAME' \`
  --tenant-id '$TENANT_ID' \`
  --location '$LOCATION'
if (\$LASTEXITCODE -ne 0) { throw 'azcmagent connect failed.' }

\$status = & \$agent show --json | ConvertFrom-Json
Write-Output ('Arc status: {0}; resource name: {1}' -f \$status.status, \$status.resourceName)
PWSH

echo "Installing and connecting the Azure Connected Machine agent on $VM_NAME ..."
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunPowerShellScript \
  --scripts "$ONBOARD_SCRIPT" \
  --query "value[].message" \
  -o tsv

MACHINE_NAME=$(az connectedmachine list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" -o tsv 2>/dev/null || true)
[ -n "$MACHINE_NAME" ] || { echo "No Arc-enabled server appeared in $RESOURCE_GROUP." >&2; exit 1; }

CONNECTIVITY=$(az connectedmachine show \
  --resource-group "$RESOURCE_GROUP" \
  --machine-name "$MACHINE_NAME" \
  --query status -o tsv)

echo "Arc-enabled server: $MACHINE_NAME (status: $CONNECTIVITY)"
[ "$CONNECTIVITY" = "Connected" ] || {
  echo "Arc-enabled server is not Connected; investigate before injecting." >&2
  exit 1
}

if [ -z "$DCR_NAME" ]; then
  DCR_NAME="${VM_NAME%-vm01}-disk-free-space-dcr"
fi
DCR_ID=$(az monitor data-collection rule show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DCR_NAME" \
  --query id -o tsv)
[ -n "$DCR_ID" ] || { echo "Data collection rule '$DCR_NAME' was not found." >&2; exit 1; }

echo "Installing Azure Monitor Agent through Azure Arc ..."
az connectedmachine extension create \
  --resource-group "$RESOURCE_GROUP" \
  --machine-name "$MACHINE_NAME" \
  --name AzureMonitorWindowsAgent \
  --publisher Microsoft.Azure.Monitor \
  --type AzureMonitorWindowsAgent \
  --location "$LOCATION" \
  --enable-auto-upgrade true \
  --output none

ARC_RESOURCE_ID=$(az connectedmachine show \
  --resource-group "$RESOURCE_GROUP" \
  --machine-name "$MACHINE_NAME" \
  --query id -o tsv)
az monitor data-collection rule association create \
  --name disk-free-space \
  --resource "$ARC_RESOURCE_ID" \
  --rule-id "$DCR_ID" \
  --output none

echo "Azure Monitor Agent and disk telemetry DCR are managed through Arc."
echo "Use --machine-name $MACHINE_NAME for Arc Run Command operations."
