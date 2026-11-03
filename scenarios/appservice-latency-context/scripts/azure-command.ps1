$ErrorActionPreference = 'Stop'
$azureArgs = @(ConvertFrom-Json $env:ALCTX_AZURE_ARGS)
$scopeIndex = [Array]::IndexOf($azureArgs, '--subscription')
if ($scopeIndex -lt 0 -or $scopeIndex + 1 -ge $azureArgs.Count) {
    throw 'An explicit --subscription UUID is required'
}
$subscription = $azureArgs[$scopeIndex + 1]
if ($subscription -notmatch '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') {
    throw 'An explicit --subscription UUID is required'
}
$remainingArgs = @(for ($i = 0; $i -lt $azureArgs.Count; $i++) {
    if ($i -ne $scopeIndex -and $i -ne $scopeIndex + 1) { $azureArgs[$i] }
})
& az @remainingArgs --subscription $subscription
exit $LASTEXITCODE
