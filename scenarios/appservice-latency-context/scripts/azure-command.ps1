$ErrorActionPreference = 'Stop'
$azureArgs = @(ConvertFrom-Json $env:ALCTX_AZURE_ARGS)
& az @azureArgs
exit $LASTEXITCODE
