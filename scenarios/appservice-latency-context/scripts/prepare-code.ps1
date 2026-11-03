$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'prepare-code.mjs') @args
exit $LASTEXITCODE
