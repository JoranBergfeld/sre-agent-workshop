# Onboard the disposable evaluation VM as an Azure Arc-enabled server.
#
# EVALUATION AND TESTING ONLY. Onboarding an Azure VM to Azure Arc requires
# Microsoft's MSFT_ARC_TEST flag and is explicitly not supported for
# production. Only host placement is simulated: Arc registration, Resource
# Graph connectivity state, and Arc Run Command behaviour are real.
param(
    [string]$ResourceGroup = 'rg-srelabarcdisk',
    [string]$VmName = 'srelabarcdisk-vm01',
    [string]$Location = 'eastus2',
    [string]$DcrName
)

$ErrorActionPreference = 'Stop'

if ($env:AZURE_SUBSCRIPTION_ID) {
    az account set --subscription $env:AZURE_SUBSCRIPTION_ID
    if ($LASTEXITCODE) { throw "Unable to select the requested Azure subscription." }
}
$subscriptionId = az account show --query id -o tsv
if ($LASTEXITCODE) { throw "Azure CLI is not authenticated. Run 'az login'." }
$tenantId = az account show --query tenantId -o tsv

$state = az provider show -n Microsoft.HybridCompute --query registrationState -o tsv 2>$null
if ($state -ne 'Registered') {
    throw "Microsoft.HybridCompute is '$state'. Run: az provider register -n Microsoft.HybridCompute"
}

Write-Host 'Requesting a short-lived ARM access token for Arc onboarding ...'
$accessToken = az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv
if (-not $accessToken) { throw 'Unable to acquire an ARM access token.' }

$onboardScript = @"
`$ErrorActionPreference = 'Stop'
`$ProgressPreference = 'SilentlyContinue'

# Evaluation-only flag: Azure VMs refuse Arc onboarding without it.
[Environment]::SetEnvironmentVariable('MSFT_ARC_TEST', 'true', 'Machine')
`$env:MSFT_ARC_TEST = 'true'

`$agent = Join-Path `$env:ProgramFiles 'AzureConnectedMachineAgent\azcmagent.exe'
if (-not (Test-Path `$agent)) {
  `$installer = Join-Path `$env:TEMP 'install_windows_azcmagent.ps1'
  Invoke-WebRequest -Uri 'https://aka.ms/azcmagent-windows' -TimeoutSec 120 -OutFile `$installer
  & `$installer
}
if (-not (Test-Path `$agent)) { throw 'Azure Connected Machine agent installation failed.' }

`$status = & `$agent show --json | ConvertFrom-Json
if (`$status.status -eq 'Connected') {
  Write-Output ('Already connected as {0}' -f `$status.resourceName)
  exit 0
}

& `$agent connect --access-token '$accessToken' --subscription-id '$subscriptionId' --resource-group '$ResourceGroup' --resource-name '$VmName' --tenant-id '$tenantId' --location '$Location'
if (`$LASTEXITCODE -ne 0) { throw 'azcmagent connect failed.' }

`$status = & `$agent show --json | ConvertFrom-Json
Write-Output ('Arc status: {0}; resource name: {1}' -f `$status.status, `$status.resourceName)
"@

Write-Host "Installing and connecting the Azure Connected Machine agent on $VmName ..."
az vm run-command invoke `
    --resource-group $ResourceGroup `
    --name $VmName `
    --command-id RunPowerShellScript `
    --scripts $onboardScript `
    --query "value[].message" `
    -o tsv
if ($LASTEXITCODE) { throw "Arc onboarding run command failed on $VmName." }

$machineName = az connectedmachine list --resource-group $ResourceGroup --query "[0].name" -o tsv 2>$null
if (-not $machineName) { throw "No Arc-enabled server appeared in $ResourceGroup." }

$connectivity = az connectedmachine show `
    --resource-group $ResourceGroup `
    --machine-name $machineName `
    --query status -o tsv

Write-Host "Arc-enabled server: $machineName (status: $connectivity)"
if ($connectivity -ne 'Connected') {
    throw 'Arc-enabled server is not Connected; investigate before injecting.'
}

if (-not $DcrName) {
    $DcrName = $VmName -replace '-vm01$', '-disk-free-space-dcr'
}
$dcrId = az monitor data-collection rule show `
    --resource-group $ResourceGroup `
    --name $DcrName `
    --query id -o tsv
if ($LASTEXITCODE -or -not $dcrId) {
    throw "Data collection rule '$DcrName' was not found."
}

Write-Host 'Installing Azure Monitor Agent through Azure Arc ...'
az connectedmachine extension create `
    --resource-group $ResourceGroup `
    --machine-name $machineName `
    --name AzureMonitorWindowsAgent `
    --publisher Microsoft.Azure.Monitor `
    --type AzureMonitorWindowsAgent `
    --location $Location `
    --enable-auto-upgrade true `
    --output none
if ($LASTEXITCODE) { throw 'Azure Monitor Agent installation through Arc failed.' }

$arcResourceId = az connectedmachine show `
    --resource-group $ResourceGroup `
    --machine-name $machineName `
    --query id -o tsv
az monitor data-collection rule association create `
    --name disk-free-space `
    --resource $arcResourceId `
    --rule-id $dcrId `
    --output none
if ($LASTEXITCODE) { throw 'Arc data collection rule association failed.' }

Write-Host 'Azure Monitor Agent and disk telemetry DCR are managed through Arc.'
Write-Host "Use -MachineName $machineName for Arc Run Command operations."
