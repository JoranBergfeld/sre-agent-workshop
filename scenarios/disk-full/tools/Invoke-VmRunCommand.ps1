# Runs a PowerShell script on a Windows VM via `az vm run-command` using an
# encoded-command wrapper — robust against quoting/parsing edge cases that can
# silently swallow inline scripts.
param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$VmName,
    [Parameter(Mandatory = $true)][string]$Script
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$encodedScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
$wrapperLine = "powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedScript"

$resultJson = az vm run-command invoke `
    --resource-group $ResourceGroup `
    --name $VmName `
    --command-id RunPowerShellScript `
    --scripts $wrapperLine `
    -o json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    throw "Failed to run command on VM '$VmName'."
}

$stdout = ($resultJson.value | Where-Object { $_.code -like 'ComponentStatus/StdOut*' } | Select-Object -First 1).message
$stderr = ($resultJson.value | Where-Object { $_.code -like 'ComponentStatus/StdErr*' } | Select-Object -First 1).message

if ($stderr -and $stderr.Trim().Length -gt 0) {
    $hasRealError = $stderr -match 'CategoryInfo|FullyQualifiedErrorId|ParserError|Exception'
    if ($hasRealError) {
        throw "VM command returned stderr: $stderr"
    }
}

if ($stdout -and $stdout.Trim().Length -gt 0) {
    Write-Host $stdout
} else {
    Write-Host "VM command completed with no stdout output."
}
