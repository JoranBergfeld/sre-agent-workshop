#!/usr/bin/env pwsh
param(
    [ValidateSet("eastus2", "swedencentral", "australiaeast")]
    [string]$Location = "eastus2",

    [ValidateLength(1, 51)]
    [ValidatePattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    [string]$Workload = "srelabapp",

    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID
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

$requestedSubscriptionId = $SubscriptionId
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId)) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE -ne 0) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run 'az login', then run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionId)) { throw "Azure CLI is not authenticated. Run 'az login' and try again." }
$activeSubscriptionName = [string](az account show --query name --output tsv); if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($activeSubscriptionName)) { throw "Unable to read the active Azure subscription name." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim()
if (-not [string]::IsNullOrWhiteSpace($requestedSubscriptionId) -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', but active subscription is '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }
Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"

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

    $resourceGroup = "rg-$Workload"

    foreach ($provider in @(
        "Microsoft.Web",
        "Microsoft.Insights",
        "Microsoft.OperationalInsights"
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

    $legacyIdentityName = "$Workload-github-deploy"
    $managedIdentityState = [string](Invoke-NativeCommand -Command "az" -Arguments @(
        "provider", "show",
        "--namespace", "Microsoft.ManagedIdentity",
        "--query", "registrationState",
        "--output", "tsv"
    ))
    $legacyPrincipalId = ""
    if ($managedIdentityState.Trim() -ceq "Registered") {
        $legacyPrincipalId = [string](Invoke-NativeCommand -Command "az" -Arguments @(
            "identity", "list",
            "--resource-group", $resourceGroup,
            "--query", "[?name=='$legacyIdentityName'].principalId | [0]",
            "--output", "tsv"
        ))
        $legacyPrincipalId = $legacyPrincipalId.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($legacyPrincipalId)) {
        $resourceGroupId = [string](Invoke-NativeCommand -Command "az" -Arguments @(
            "group", "show",
            "--name", $resourceGroup,
            "--query", "id",
            "--output", "tsv"
        ))
        $websiteContributorRoleId = "/subscriptions/$activeSubscriptionId/providers/Microsoft.Authorization/roleDefinitions/de139f84-1756-47ae-9be6-808fbbe84772"
        $legacyRoleAssignmentIds = @(Invoke-NativeCommand -Command "az" -Arguments @(
            "role", "assignment", "list",
            "--assignee-object-id", $legacyPrincipalId,
            "--scope", $resourceGroupId.Trim(),
            "--role", $websiteContributorRoleId,
            "--query", "[].id",
            "--output", "tsv"
        ))

        if ($legacyRoleAssignmentIds.Count -gt 0) {
            $deleteRoleAssignmentArguments = @(
                "role", "assignment", "delete",
                "--ids"
            ) + $legacyRoleAssignmentIds
            Invoke-NativeCommand `
                -Command "az" `
                -Arguments $deleteRoleAssignmentArguments `
                -DiscardOutput
        }

        Invoke-NativeCommand -Command "az" -Arguments @(
            "identity", "delete",
            "--resource-group", $resourceGroup,
            "--name", $legacyIdentityName,
            "--output", "none"
        ) -DiscardOutput
        Write-Host "Removed legacy GitHub deployment identity: $legacyIdentityName"
    }

    $outputsJson = (Invoke-NativeCommand -Command "az" -Arguments @(
        "deployment", "group", "create",
        "--resource-group", $resourceGroup,
        "--template-file", "scenarios/cloud-agent-handover/infra/bicep/main.bicep",
        "--parameters",
        "location=$Location",
        "workloadName=$Workload",
        "--query", "properties.outputs",
        "--output", "json"
    )) -join [Environment]::NewLine
    $outputs = $outputsJson | ConvertFrom-Json

    $webApp = [string]$outputs.webAppName.value
    $webHost = [string]$outputs.webAppHostName.value

    foreach ($outputValue in @{
        webAppName = $webApp
        webAppHostName = $webHost
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
        AZURE_RESOURCE_GROUP = $resourceGroup
        AZURE_WEBAPP_NAME    = $webApp
        AZURE_LOCATION       = $Location
        WORKLOAD_NAME        = $Workload
    }).GetEnumerator()) {
        Invoke-NativeCommand -Command "gh" -Arguments @(
            "variable", "set", $variable.Key,
            "--repo", $repository,
            "--body", [string]$variable.Value
        ) -DiscardOutput
    }

    $existingVariables = @(Invoke-NativeCommand -Command "gh" -Arguments @(
        "variable", "list",
        "--repo", $repository,
        "--json", "name",
        "--jq", ".[].name"
    ))
    foreach ($legacyVariable in @(
        "AZURE_CLIENT_ID",
        "AZURE_TENANT_ID",
        "AZURE_SUBSCRIPTION_ID"
    )) {
        if ($existingVariables -contains $legacyVariable) {
            Invoke-NativeCommand -Command "gh" -Arguments @(
                "variable", "delete", $legacyVariable,
                "--repo", $repository
            ) -DiscardOutput
        }
    }

    Write-Host "Application: https://$webHost"
    Write-Host "Health:      https://$webHost/health"
    Write-Host "Repository:  $repository"
}
finally {
    Pop-Location
}
