# Stops only CPU workers that carry this scenario's exact path and marker.
param(
    [string]$ResourceGroup = "rg-srelabcpurunaway",
    [string]$VmName = "srelabcpurunaway-vm01"
)

$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID
if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

$script = @'
$scenarioDirectory = 'C:\SreCpuRunaway'
$workerScriptPath = Join-Path $scenarioDirectory 'cpu-runaway-worker.ps1'
$statePath = Join-Path $scenarioDirectory 'cpu-runaway-state.json'
$marker = 'sre-cpu-runaway-v1'
$workerPids = @()

if (Test-Path $statePath) {
  try {
    $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ($state.Marker -eq $marker -and $state.WorkerScriptPath -eq $workerScriptPath) {
      $workerPids = @($state.Pids)
    }
  } catch {
    Write-Warning "Ignoring unreadable CPU Runaway state file."
  }
}

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object {
    $_.CommandLine -like "*$workerScriptPath*" -and
    $_.CommandLine -like "*$marker*"
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

foreach ($workerPid in $workerPids) {
  $worker = Get-CimInstance Win32_Process -Filter "ProcessId=$workerPid" -ErrorAction SilentlyContinue
  if ($worker -and $worker.CommandLine -like "*$workerScriptPath*" -and $worker.CommandLine -like "*$marker*") {
    Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Remove-Item -Path $statePath, $workerScriptPath -Force -ErrorAction SilentlyContinue
Write-Output 'Stopped only CPU Runaway worker processes'
'@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
