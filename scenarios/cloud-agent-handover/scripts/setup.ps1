#!/usr/bin/env pwsh
param(
    [ValidateSet("eastus2", "swedencentral", "australiaeast")]
    [string]$Location = "eastus2",

    [ValidateLength(1, 51)]
    [ValidatePattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    [string]$Workload = "srelabapp",

    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,

    # Only try the preferred region instead of falling back through
    # infra/placement.json. Existing deployments always stay pinned.
    [switch]$NoRegionFallback,

    # Test and publish the app locally (needs dotnet) instead of deploying the
    # verified build artifact for the current commit from this repository.
    [switch]$LocalBuild
)

# The resource group rg-<workload> must already exist; setup never creates,
# relocates, or deletes resource groups, identities, or repository variables.

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

$requiredCommands = @("az", "gh", "node")
if ($LocalBuild) { $requiredCommands += "dotnet" }
foreach ($requiredCommand in $requiredCommands) {
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

    # Read-only ownership/eligibility check before anything is changed: the
    # designated resource group must already exist and be empty or owned by
    # this scenario, and an existing deployment stays pinned.
    $checkArguments = @(
        "scripts/placement/provision.mjs", "check", "cloud-agent-handover",
        "--location", $Location,
        "--workload", $Workload,
        "--resource-group", $resourceGroup,
        "--require-group"
    )
    if ($NoRegionFallback) { $checkArguments += "--no-region-fallback" }
    & node @checkArguments
    if ($LASTEXITCODE -ne 0) { throw "Setup stopped before changing anything." }

    $publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-handover-$([Guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null
    try {
        if ($LocalBuild) {
            Invoke-NativeCommand -Command "dotnet" -Arguments @(
                "test", "scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj"
            ) -DiscardOutput
            Invoke-NativeCommand -Command "dotnet" -Arguments @(
                "publish", "scenarios/cloud-agent-handover/src/HandoverApp.csproj",
                "--configuration", "Release",
                "--output", (Join-Path $publishRoot "publish")
            ) -DiscardOutput
            $package = Join-Path $publishRoot "app.zip"
            Compress-Archive -Path (Join-Path $publishRoot "publish/*") -DestinationPath $package
            $packageSource = "local build of the current checkout"
        }
        else {
            # Exact-commit, provenance- and checksum-verified ZIP from this
            # repository's successful 'Validate Cloud Agent Handover
            # Application' run.
            $artifactJson = & node scripts/build-artifacts/resolve.mjs `
                --scenario cloud-agent-handover `
                --variant application `
                --output-dir $publishRoot `
                --repo $repository
            if ($LASTEXITCODE -ne 0) {
                throw "Setup stopped before changing anything. Dispatch the build shown above, wait for it to succeed, and rerun setup; or rerun with -LocalBuild."
            }
            $artifact = ($artifactJson -join "`n") | ConvertFrom-Json
            $package = [string]$artifact.deploymentZip
            $packageSource = "build artifact for commit $($artifact.sourceSha)"
        }

        # Earlier versions created a '<workload>-github-deploy' identity and
        # AZURE_* repository variables. They are never deleted automatically:
        # they may belong to another deployment or still be in use.
        $legacyIdentityName = "$Workload-github-deploy"
        $legacyGuidance = @()
        $managedIdentityState = [string](Invoke-NativeCommand -Command "az" -Arguments @(
            "provider", "show",
            "--namespace", "Microsoft.ManagedIdentity",
            "--query", "registrationState",
            "--output", "tsv"
        ))
        if ($managedIdentityState.Trim() -ceq "Registered") {
            $legacyPrincipalIdRaw = Invoke-NativeCommand -Command "az" -Arguments @(
                "identity", "list",
                "--resource-group", $resourceGroup,
                "--query", "[?name=='$legacyIdentityName'].principalId | [0]",
                "--output", "tsv"
            )
            $legacyPrincipalId = if ($null -eq $legacyPrincipalIdRaw) { "" } else { ([string]$legacyPrincipalIdRaw).Trim() }
            if (-not [string]::IsNullOrWhiteSpace($legacyPrincipalId)) {
                $legacyGuidance += "Legacy identity $legacyIdentityName exists in $resourceGroup. If nothing uses it, remove it and its role assignments manually:"
                $legacyGuidance += "  az role assignment delete --assignee $legacyPrincipalId --role `"Website Contributor`" --resource-group $resourceGroup"
                $legacyGuidance += "  az identity delete --resource-group $resourceGroup --name $legacyIdentityName"
            }
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
                $legacyGuidance += "Legacy repository variable $legacyVariable is unused by this scenario. If nothing else uses it: gh variable delete $legacyVariable --repo $repository"
            }
        }

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

        # The shared placement engine deploys infra/bicep/main.bicep into the
        # designated resource group in the first eligible region, retrying only
        # classified capacity/SKU/quota failures that are proven non-mutating.
        # An existing deployment is never relocated or deleted.
        $outputsFile = [System.IO.Path]::GetTempFileName()
        try {
            $placementArguments = @(
                "scripts/placement/provision.mjs", "deploy", "cloud-agent-handover",
                "--location", $Location,
                "--workload", $Workload,
                "--resource-group", $resourceGroup,
                "--outputs-file", $outputsFile
            )
            if ($NoRegionFallback) { $placementArguments += "--no-region-fallback" }
            & node @placementArguments
            if ($LASTEXITCODE -ne 0) { throw "Infrastructure provisioning failed (exit code $LASTEXITCODE)." }
            $outputs = Get-Content -Raw $outputsFile | ConvertFrom-Json
        }
        finally {
            Remove-Item -LiteralPath $outputsFile -Force -ErrorAction SilentlyContinue
        }
        $Location = [string](Get-Content -Raw ".sre-workshop/cloud-agent-handover-placement.json" | ConvertFrom-Json).location
        Write-Host "Azure region: $Location"

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

        Invoke-NativeCommand -Command "az" -Arguments @(
            "webapp", "deploy",
            "--resource-group", $resourceGroup,
            "--name", $webApp,
            "--src-path", $package,
            "--type", "zip",
            "--output", "none"
        ) -DiscardOutput
        Write-Host "Deployed $packageSource."
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

    foreach ($line in $legacyGuidance) { Write-Host $line }

    Write-Host "Application: https://$webHost"
    Write-Host "Health:      https://$webHost/health"
    Write-Host "Repository:  $repository"
}
finally {
    Pop-Location
}
