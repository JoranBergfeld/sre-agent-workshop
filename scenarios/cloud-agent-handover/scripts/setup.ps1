#!/usr/bin/env pwsh
param(
    [ValidateSet("eastus2", "swedencentral", "australiaeast")]
    [string]$Location = "eastus2",

    [ValidateLength(1, 51)]
    [ValidatePattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    [string]$Workload = "srelabapp"
)

$ErrorActionPreference = "Stop"
$UpstreamRepository = "JoranBergfeld/sre-agent-workshop"

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

foreach ($requiredCommand in @("az", "gh", "dotnet")) {
    if (-not (Get-Command $requiredCommand -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $requiredCommand"
    }
}

try {
    $accountJson = (Invoke-NativeCommand -Command "az" -Arguments @(
        "account", "show", "--output", "json"
    )) -join [Environment]::NewLine
}
catch {
    throw "Azure CLI is not authenticated. Run 'az login' and try again."
}
$account = $accountJson | ConvertFrom-Json

try {
    Invoke-NativeCommand -Command "gh" -Arguments @("auth", "status") -DiscardOutput
}
catch {
    throw "GitHub CLI is not authenticated. Run 'gh auth login' and try again."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
Push-Location $repoRoot

try {
    $repository = [string](Invoke-NativeCommand -Command "gh" -Arguments @(
        "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"
    ))
    $repository = $repository.Trim()

    $repositoryParts = $repository -split "/", 2
    if ($repositoryParts.Count -ne 2 -or
        [string]::IsNullOrWhiteSpace($repositoryParts[0]) -or
        [string]::IsNullOrWhiteSpace($repositoryParts[1])) {
        throw "GitHub repository must be in owner/name format; received: $repository"
    }

    $isTemplate = [string](Invoke-NativeCommand -Command "gh" -Arguments @(
        "api", "repos/$repository", "--jq", ".is_template"
    ))
    if ($repository -eq $UpstreamRepository -or $isTemplate.Trim() -eq "true") {
        throw "Use the template, clone the generated repository, and run setup in the generated repository."
    }

    $owner = $repositoryParts[0]
    $name = $repositoryParts[1]
    $query = @'
query($owner:String!, $name:String!) {
  repository(owner:$owner, name:$name) {
    suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:100) {
      nodes { login }
    }
  }
}
'@
    $actors = @(Invoke-NativeCommand -Command "gh" -Arguments @(
        "api", "graphql",
        "-f", "query=$query",
        "-f", "owner=$owner",
        "-f", "name=$name",
        "--jq", ".data.repository.suggestedActors.nodes[].login"
    ))
    if ($actors -notcontains "copilot-swe-agent") {
        throw "Copilot coding agent is not assignable in $repository. Enable it before setup."
    }

    $subscriptionId = [string]$account.id
    $tenantId = [string]$account.tenantId
    $resourceGroup = "rg-$Workload"

    foreach ($provider in @(
        "Microsoft.Web",
        "Microsoft.Insights",
        "Microsoft.OperationalInsights",
        "Microsoft.ManagedIdentity"
    )) {
        Invoke-NativeCommand -Command "az" -Arguments @(
            "provider", "register",
            "--namespace", $provider,
            "--wait",
            "--output", "none"
        ) -DiscardOutput
    }

    Invoke-NativeCommand -Command "az" -Arguments @(
        "group", "create",
        "--name", $resourceGroup,
        "--location", $Location,
        "--tags", "workshop=sre-agent", "environment=demo",
        "--output", "none"
    ) -DiscardOutput

    $outputsJson = (Invoke-NativeCommand -Command "az" -Arguments @(
        "deployment", "group", "create",
        "--resource-group", $resourceGroup,
        "--template-file", "scenarios/cloud-agent-handover/infra/bicep/main.bicep",
        "--parameters",
        "location=$Location",
        "workloadName=$Workload",
        "githubRepository=$repository",
        "--query", "properties.outputs",
        "--output", "json"
    )) -join [Environment]::NewLine
    $outputs = $outputsJson | ConvertFrom-Json

    $webApp = [string]$outputs.webAppName.value
    $webHost = [string]$outputs.webAppHostName.value
    $clientId = [string]$outputs.deploymentClientId.value

    foreach ($outputValue in @{
        webAppName = $webApp
        webAppHostName = $webHost
        deploymentClientId = $clientId
    }.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace($outputValue.Value)) {
            throw "Deployment output '$($outputValue.Key)' was empty."
        }
    }

    $publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-handover-$([Guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null

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
            "--resource-group", $resourceGroup,
            "--name", $webApp,
            "--src-path", (Join-Path $publishRoot "app.zip"),
            "--type", "zip",
            "--output", "none"
        ) -DiscardOutput
    }
    finally {
        if (Test-Path -LiteralPath $publishRoot) {
            Remove-Item -LiteralPath $publishRoot -Recurse -Force
        }
    }

    foreach ($variable in ([ordered]@{
        AZURE_CLIENT_ID       = $clientId
        AZURE_TENANT_ID       = $tenantId
        AZURE_SUBSCRIPTION_ID = $subscriptionId
        AZURE_RESOURCE_GROUP  = $resourceGroup
        AZURE_WEBAPP_NAME     = $webApp
        AZURE_LOCATION        = $Location
        WORKLOAD_NAME         = $Workload
    }).GetEnumerator()) {
        Invoke-NativeCommand -Command "gh" -Arguments @(
            "variable", "set", $variable.Key,
            "--repo", $repository,
            "--body", [string]$variable.Value
        ) -DiscardOutput
    }

    Write-Host "Application: https://$webHost"
    Write-Host "Health:      https://$webHost/health"
    Write-Host "Repository:  $repository"
}
finally {
    Pop-Location
}
