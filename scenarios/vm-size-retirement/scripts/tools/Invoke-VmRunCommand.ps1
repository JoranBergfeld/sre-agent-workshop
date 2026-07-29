param(
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$VmName,
    [Parameter(Mandatory = $true)][string]$Script
)

$ErrorActionPreference = 'Stop'
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

if ($stderr -and $stderr.Trim().Length -gt 0 -and $stderr -match 'CategoryInfo|FullyQualifiedErrorId|ParserError|Exception') {
    throw "VM command returned stderr: $stderr"
}

if ($stdout -and $stdout.Trim().Length -gt 0) {
    Write-Host $stdout
} else {
    Write-Host "VM command completed with no stdout output."
}
