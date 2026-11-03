#!/usr/bin/env pwsh
# Invokes the Azure CLI with literal arguments supplied as JSON by placement.mjs.
# Windows installs az as a .cmd shim, which Node cannot spawn without a shell.
$ErrorActionPreference = 'Stop'
$arguments = [string[]](ConvertFrom-Json -InputObject $env:SRE_WORKSHOP_AZ_ARGS)
& az @arguments
exit $LASTEXITCODE
