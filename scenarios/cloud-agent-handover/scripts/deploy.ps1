#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME,
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Command,

        [string[]]$Arguments = @(),

        [switch]$DiscardOutput
    )

    if ($DiscardOutput) {
        & $Command @Arguments *> $null
        $output = $null
    }
    else {
        $output = & $Command @Arguments
    }

    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Command '$Command' failed with exit code $exitCode."
    }

    return $output
}

foreach ($requiredCommand in @("az", "dotnet")) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $requiredCommand"
    }
}

if (-not [string]::IsNullOrWhiteSpace($SubscriptionId)) {
    try {
        Invoke-NativeCommand -Command "az" -Arguments @(
            "account", "set", "--subscription", $SubscriptionId
        ) -DiscardOutput
    }
    catch {
        throw "Unable to select Azure subscription '$SubscriptionId'. Run 'az login', then run: az account set --subscription `"$SubscriptionId`""
    }
}

try {
    $activeSubscriptionId = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "account", "show", "--query", "id", "--output", "tsv"
    ))
    $activeSubscriptionName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "account", "show", "--query", "name", "--output", "tsv"
    ))
}
catch {
    throw "Azure CLI is not authenticated. Run 'az login' and try again."
}

$activeSubscriptionId = $activeSubscriptionId.Trim()
$activeSubscriptionName = $activeSubscriptionName.Trim()

if ([string]::IsNullOrWhiteSpace($activeSubscriptionId) -or
    [string]::IsNullOrWhiteSpace($activeSubscriptionName)) {
    throw "Unable to read the active Azure subscription. Run 'az login' and try again."
}

if (-not [string]::IsNullOrWhiteSpace($SubscriptionId) -and
    $activeSubscriptionId -cne $SubscriptionId) {
    throw "Azure subscription mismatch: requested '$SubscriptionId', but active subscription is '$activeSubscriptionId'."
}

Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

$resourceGroupExists = [string](Invoke-NativeCommand -Command "az" -Arguments @(
    "group", "exists", "--name", $ResourceGroup, "--output", "tsv"
))
if ($resourceGroupExists.Trim() -cne "true") {
    throw "Resource group not found: $ResourceGroup"
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
    $AppName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "list",
        "--resource-group", $ResourceGroup,
        "--query", "[0].name",
        "--output", "tsv"
    ))
    $AppName = $AppName.Trim()
}

if ([string]::IsNullOrWhiteSpace($AppName)) {
    throw "No web app found in $ResourceGroup."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
$publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-handover-$([Guid]::NewGuid())"
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null

Push-Location $repoRoot
try {
    Invoke-NativeCommand -Command "dotnet" -Arguments @(
        "test", "scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj"
    ) -DiscardOutput
    Invoke-NativeCommand -Command "dotnet" -Arguments @(
        "publish", "scenarios/cloud-agent-handover/src/HandoverApp.csproj",
        "--configuration", "Release",
        "--output", (Join-Path $publishRoot "publish")
    ) -DiscardOutput

    Compress-Archive `
        -Path (Join-Path $publishRoot "publish/*") `
        -DestinationPath (Join-Path $publishRoot "app.zip")

    Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "deploy",
        "--resource-group", $ResourceGroup,
        "--name", $AppName,
        "--src-path", (Join-Path $publishRoot "app.zip"),
        "--type", "zip",
        "--output", "none"
    ) -DiscardOutput

    $hostName = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "webapp", "show",
        "--resource-group", $ResourceGroup,
        "--name", $AppName,
        "--query", "defaultHostName",
        "--output", "tsv"
    ))
    $hostName = $hostName.Trim()

    Write-Host "Application deployed from the current checkout."
    Write-Host "Application: https://$hostName"
    Write-Host "Health:      https://$hostName/health"
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $publishRoot) {
        Remove-Item -LiteralPath $publishRoot -Recurse -Force
    }
}
