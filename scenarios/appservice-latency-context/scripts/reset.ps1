#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'lifecycle.mjs') reset @args
exit $LASTEXITCODE
