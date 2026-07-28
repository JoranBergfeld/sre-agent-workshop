# Minimal SRE Agent to Copilot Cloud Agent Handover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current App Service shop/SQL/canary workshop with a minimal Blazor incident that the Azure SRE Agent diagnoses and hands to GitHub Copilot coding agent for a code-only fix.

**Architecture:** Keep the shared multi-track scenario framework, AKS track, and VM track unchanged. Refactor `scenarios/cloud-agent-handover/` into a Blazor Web App on a B1 Linux App Service with workspace-based Application Insights, one route-specific 5xx alert, local setup scripts, and a push-to-`main` OIDC deployment workflow. The intentionally unfinished `POST /api/feature` endpoint ships as HTTP 500; the approved SRE Agent issue asks Copilot to implement a fixed HTTP 200 JSON contract.

**Tech Stack:** .NET 10 Blazor Web App, ASP.NET Core minimal APIs, xUnit, `Microsoft.AspNetCore.Mvc.Testing`, Application Insights, Azure Bicep, Azure CLI, GitHub CLI, GitHub Actions OIDC, Bash, PowerShell 7, Node-based scenario tooling.

---

## File map

### Application

- Replace `scenarios/cloud-agent-handover/src/Shop.csproj` with `scenarios/cloud-agent-handover/src/HandoverApp.csproj`.
- Replace `scenarios/cloud-agent-handover/src/Program.cs` with the Blazor host, health endpoint, and intentionally unfinished feature endpoint.
- Delete `scenarios/cloud-agent-handover/src/Models/Product.cs`.
- Create focused Blazor files under `scenarios/cloud-agent-handover/src/Components/`.
- Create `scenarios/cloud-agent-handover/src/wwwroot/feature-demo.js` for the browser-side request burst.
- Create `scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj`.
- Create `scenarios/cloud-agent-handover/tests/HandoverAppFactory.cs`.
- Create `scenarios/cloud-agent-handover/tests/EndpointTests.cs`.

### Azure infrastructure

- Simplify `scenarios/cloud-agent-handover/infra/bicep/main.bicep`.
- Simplify `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`.
- Simplify `scenarios/cloud-agent-handover/infra/bicep/modules/appservice.bicep`.
- Rework `scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep` into the GitHub Actions deployment identity, federated credential, and Website Contributor assignment.
- Keep `scenarios/cloud-agent-handover/infra/bicep/modules/monitoring.bicep`.
- Delete `scenarios/cloud-agent-handover/infra/bicep/modules/sql.bicep`.
- Delete `scenarios/cloud-agent-handover/db/`.

### Local automation

- Create `scenarios/cloud-agent-handover/scripts/setup.sh` and `setup.ps1`.
- Create `scenarios/cloud-agent-handover/scripts/cleanup.sh` and `cleanup.ps1`.

### Scenario

- Delete `scenarios/cloud-agent-handover/scenarios/red-button-500/`.
- Delete `scenarios/cloud-agent-handover/scenarios/canary-bad-release/`.
- Create `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/` with manifest, alert, investigation query, Bash/PowerShell injection and validation scripts, and attendee README.
- Regenerate `scenarios/cloud-agent-handover/scenarios/INDEX.md`.
- Regenerate `scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep`.
- Regenerate the scenario table in `scenarios/cloud-agent-handover/README.md`.

### GitHub workflows and repository setup

- Replace `.github/workflows/deploy-appservice-app.yml` with OIDC application deployment.
- Delete `.github/workflows/deploy-appservice-infra.yml`.
- Simplify `.github/workflows/validate-appservice-infra.yml`.
- Create `.github/workflows/validate-appservice-app.yml`.
- Update `.devcontainer/cloud-agent-handover/devcontainer.json`.

### Documentation

- Rewrite `scenarios/cloud-agent-handover/README.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/00-prerequisites.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/02-deploy-application.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md`.
- Rewrite `scenarios/cloud-agent-handover/docs/99-cleanup.md`.
- Rewrite `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`.
- Update `README.md`, `CONTRIBUTING.md`, and `docs/connect-github-to-sre-agent.md`.

## Task 1: Scaffold the Blazor application and endpoint tests

**Files:**
- Delete: `scenarios/cloud-agent-handover/src/Models/Product.cs`
- Delete: `scenarios/cloud-agent-handover/src/Shop.csproj`
- Replace: `scenarios/cloud-agent-handover/src/Program.cs`
- Create: `scenarios/cloud-agent-handover/src/HandoverApp.csproj`
- Create: `scenarios/cloud-agent-handover/src/Components/App.razor`
- Create: `scenarios/cloud-agent-handover/src/Components/Routes.razor`
- Create: `scenarios/cloud-agent-handover/src/Components/_Imports.razor`
- Create: `scenarios/cloud-agent-handover/src/Components/Layout/MainLayout.razor`
- Create: `scenarios/cloud-agent-handover/src/Components/Pages/Error.razor`
- Create: `scenarios/cloud-agent-handover/src/Components/Pages/Home.razor`
- Create: `scenarios/cloud-agent-handover/src/wwwroot/app.css`
- Create: `scenarios/cloud-agent-handover/src/wwwroot/feature-demo.js`
- Create: `scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj`
- Create: `scenarios/cloud-agent-handover/tests/HandoverAppFactory.cs`
- Create: `scenarios/cloud-agent-handover/tests/EndpointTests.cs`

- [ ] **Step 1: Remove the shop-specific source and scaffold an empty interactive Blazor app**

Run:

```bash
git rm scenarios/cloud-agent-handover/src/Models/Product.cs scenarios/cloud-agent-handover/src/Shop.csproj
rm -rf scenarios/cloud-agent-handover/src/Components scenarios/cloud-agent-handover/src/Properties scenarios/cloud-agent-handover/src/wwwroot
dotnet new blazor \
  --name HandoverApp \
  --output scenarios/cloud-agent-handover/src \
  --framework net10.0 \
  --interactivity Server \
  --all-interactive \
  --empty \
  --force \
  --no-restore
```

Expected: `scenarios/cloud-agent-handover/src/HandoverApp.csproj` and the empty Blazor component structure exist; `Models/Product.cs` is gone.

- [ ] **Step 2: Add Application Insights and the test project**

Run:

```bash
dotnet add scenarios/cloud-agent-handover/src/HandoverApp.csproj \
  package Microsoft.ApplicationInsights.AspNetCore --version 2.22.0
dotnet new xunit \
  --name HandoverApp.Tests \
  --output scenarios/cloud-agent-handover/tests \
  --framework net10.0 \
  --no-restore
dotnet add scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj \
  reference scenarios/cloud-agent-handover/src/HandoverApp.csproj
dotnet add scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj \
  package Microsoft.AspNetCore.Mvc.Testing --version 10.0.0
```

Expected: the application references Application Insights and the test project references the application.

- [ ] **Step 3: Write the failing endpoint tests**

Create `scenarios/cloud-agent-handover/tests/HandoverAppFactory.cs`:

```csharp
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace HandoverApp.Tests;

public sealed class HandoverAppFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
    }
}
```

Replace `scenarios/cloud-agent-handover/tests/UnitTest1.cs` with `scenarios/cloud-agent-handover/tests/EndpointTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;

namespace HandoverApp.Tests;

public sealed class EndpointTests(HandoverAppFactory factory)
    : IClassFixture<HandoverAppFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await client.GetAsync("/health");
        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("healthy", payload?.Status);
    }

    [Fact]
    public async Task Feature_documents_the_initial_unfinished_state()
    {
        var response = await client.PostAsync("/api/feature", content: null);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Home_renders_the_handover_button()
    {
        var html = await client.GetStringAsync("/");

        Assert.Contains("Run unfinished feature", html);
        Assert.Contains("SRE Agent to Copilot", html);
    }

    private sealed record HealthResponse(string Status);
}
```

- [ ] **Step 4: Run the tests and verify they fail before the application contract exists**

Run:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

Expected: FAIL because `/health`, `/api/feature`, and the required page content are not implemented.

- [ ] **Step 5: Implement the minimal host and intentional failure**

Replace `scenarios/cloud-agent-handover/src/Program.cs`:

```csharp
using HandoverApp.Components;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await Results.Problem(
            statusCode: StatusCodes.Status500InternalServerError,
            title: "The feature is not implemented yet.")
            .ExecuteAsync(context);
    });
});

app.UseAntiforgery();
app.MapStaticAssets();

app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.MapPost("/api/feature", HandleFeature);

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();

static IResult HandleFeature(ILogger<Program> logger)
{
    var exception = new NotImplementedException(
        "Implement POST /api/feature and return the documented success response.");
    logger.LogError(exception, "The unfinished feature endpoint was invoked.");
    throw exception;
}

public partial class Program;
```

- [ ] **Step 6: Implement the Blazor page and browser-side request burst**

Replace `scenarios/cloud-agent-handover/src/Components/Pages/Home.razor`:

```razor
@page "/"
@inject IJSRuntime JS

<PageTitle>SRE Agent to Copilot Handover</PageTitle>

<main class="demo-shell">
    <section class="demo-card">
        <p class="eyebrow">Azure SRE Agent Workshop</p>
        <h1>SRE Agent to Copilot</h1>
        <p class="intro">
            Trigger one unfinished feature, watch the incident investigation,
            then hand the code fix to GitHub Copilot.
        </p>

        <div class="health-row">
            <span class="health-dot"></span>
            <span>Application health: online</span>
        </div>

        <button class="feature-button" @onclick="RunFeature" disabled="@running">
            @(running ? "Triggering incident..." : "Run unfinished feature")
        </button>

        @if (result is not null)
        {
            <div class="result @(result.StatusCode >= 500 ? "failed" : "succeeded")">
                <strong>HTTP @result.StatusCode</strong>
                <span>@result.Message</span>
            </div>
        }
    </section>
</main>

@code {
    private bool running;
    private FeatureInvocationResult? result;

    private async Task RunFeature()
    {
        running = true;
        result = await JS.InvokeAsync<FeatureInvocationResult>(
            "featureDemo.run",
            "/api/feature",
            6);
        running = false;
    }

    private sealed record FeatureInvocationResult(int StatusCode, string Message);
}
```

Create `scenarios/cloud-agent-handover/src/wwwroot/feature-demo.js`:

```javascript
window.featureDemo = {
  run: async (path, attempts) => {
    let firstResult = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetch(path, { method: "POST" });
      let body = {};

      try {
        body = await response.json();
      } catch {
        body = {};
      }

      if (attempt === 0) {
        firstResult = {
          statusCode: response.status,
          message: body.message ?? body.title ?? "The request failed."
        };
      }
    }

    return firstResult;
  }
};
```

Ensure `scenarios/cloud-agent-handover/src/Components/App.razor` loads the script immediately before Blazor:

```razor
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <base href="/" />
    <ResourcePreloader />
    <link rel="stylesheet" href="@Assets["app.css"]" />
    <link rel="stylesheet" href="@Assets["HandoverApp.styles.css"]" />
    <ImportMap />
    <HeadOutlet />
</head>
<body>
    <Routes />
    <ReconnectModal />
    <script src="@Assets["feature-demo.js"]"></script>
    <script src="@Assets["_framework/blazor.web.js"]"></script>
</body>
</html>
```

- [ ] **Step 7: Add focused styling**

Replace `scenarios/cloud-agent-handover/src/wwwroot/app.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #172033;
  background: #eef3f8;
}

body {
  margin: 0;
}

button {
  font: inherit;
}

.demo-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.demo-card {
  width: min(560px, 100%);
  box-sizing: border-box;
  padding: 40px;
  border: 1px solid #dbe4ee;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 24px 60px rgb(23 32 51 / 12%);
}

.eyebrow {
  margin: 0 0 8px;
  color: #56657a;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 7vw, 3.5rem);
  line-height: 1;
}

.intro {
  margin: 20px 0;
  color: #56657a;
  line-height: 1.6;
}

.health-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 24px 0;
  font-weight: 650;
}

.health-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #1a7f37;
  box-shadow: 0 0 0 5px rgb(26 127 55 / 12%);
}

.feature-button {
  width: 100%;
  padding: 14px 18px;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: #b42318;
  font-weight: 750;
  cursor: pointer;
}

.feature-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.result {
  display: grid;
  gap: 4px;
  margin-top: 18px;
  padding: 14px;
  border-radius: 12px;
}

.result.failed {
  color: #912018;
  background: #fff1f0;
}

.result.succeeded {
  color: #116329;
  background: #edfff2;
}
```

- [ ] **Step 8: Run the application tests**

Run:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

Expected: PASS with three tests.

- [ ] **Step 9: Commit the application slice**

Run:

```bash
git add scenarios/cloud-agent-handover/src scenarios/cloud-agent-handover/tests
git commit -m "feat(appservice): add minimal Blazor handover app"
```

## Task 2: Simplify the Azure substrate and add repository-bound OIDC

**Files:**
- Delete: `scenarios/cloud-agent-handover/db/grant.sql`
- Delete: `scenarios/cloud-agent-handover/db/schema.sql`
- Delete: `scenarios/cloud-agent-handover/infra/bicep/modules/sql.bicep`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/main.bicep`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/modules/appservice.bicep`
- Modify: `scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep`

- [ ] **Step 1: Delete SQL and canary-only infrastructure**

Run:

```bash
git rm -r scenarios/cloud-agent-handover/db
git rm scenarios/cloud-agent-handover/infra/bicep/modules/sql.bicep
```

- [ ] **Step 2: Rework the deployment identity module**

Replace `scenarios/cloud-agent-handover/infra/bicep/modules/identity.bicep`:

```bicep
@description('Azure region for identity resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('GitHub repository in owner/name form')
param githubRepository string

var websiteContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'de139f84-1756-47ae-9be6-808fbbe84772'
)

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${workloadName}-github-deploy'
  location: location
  tags: tags
}

resource githubMainCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deploymentIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:ref:refs/heads/main'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

resource websiteContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deploymentIdentity.id, websiteContributorRoleId)
  properties: {
    roleDefinitionId: websiteContributorRoleId
    principalId: deploymentIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output clientId string = deploymentIdentity.properties.clientId
output principalId string = deploymentIdentity.properties.principalId
output resourceId string = deploymentIdentity.id
```

- [ ] **Step 3: Simplify the App Service module**

Replace `scenarios/cloud-agent-handover/infra/bicep/modules/appservice.bicep`:

```bicep
@description('Azure region for the App Service resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Deterministic suffix for the globally unique web app name')
param uniqueSuffix string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Log Analytics workspace resource ID for diagnostic settings')
param logAnalyticsId string

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${workloadName}-plan'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${workloadName}-web-${uniqueSuffix}'
  location: location
  tags: tags
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      healthCheckPath: '/health'
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'to-law'
  scope: webApp
  properties: {
    workspaceId: logAnalyticsId
    logs: [
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServicePlatformLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output webAppName string = webApp.name
output webAppHostName string = webApp.properties.defaultHostName
```

- [ ] **Step 4: Simplify the main template**

Replace `scenarios/cloud-agent-handover/infra/bicep/main.bicep`:

```bicep
targetScope = 'resourceGroup'

@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

param workloadName string = 'srelabapp'
param githubRepository string

param tags object = {
  workshop: 'sre-agent'
  environment: 'demo'
}

var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 4)

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

module deploymentIdentity 'modules/identity.bicep' = {
  name: 'deployment-identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    githubRepository: githubRepository
  }
}

module appservice 'modules/appservice.bicep' = {
  name: 'appservice'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    uniqueSuffix: uniqueSuffix
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    logAnalyticsId: monitoring.outputs.logAnalyticsId
  }
}

module scenarioAlerts 'modules/scenario-alerts.bicep' = {
  name: 'scenario-alerts'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    logAnalyticsResourceId: monitoring.outputs.logAnalyticsId
  }
}

output webAppName string = appservice.outputs.webAppName
output webAppHostName string = appservice.outputs.webAppHostName
output logAnalyticsId string = monitoring.outputs.logAnalyticsId
output deploymentClientId string = deploymentIdentity.outputs.clientId
```

Replace `scenarios/cloud-agent-handover/infra/bicep/main.bicepparam`:

```bicep
using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabapp'
param githubRepository = 'owner/repository'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
```

- [ ] **Step 5: Compile the simplified Bicep**

Run:

```bash
az bicep build --file scenarios/cloud-agent-handover/infra/bicep/main.bicep --stdout >/dev/null
```

Expected: exit 0 with no unresolved SQL, slot, or app-identity references.

- [ ] **Step 6: Commit the infrastructure slice**

Run:

```bash
git add -A scenarios/cloud-agent-handover
git commit -m "refactor(appservice): reduce infrastructure to handover essentials"
```

## Task 3: Replace the scenarios with `cloud-agent-handover`

**Files:**
- Delete: `scenarios/cloud-agent-handover/scenarios/canary-bad-release/`
- Delete: `scenarios/cloud-agent-handover/scenarios/red-button-500/`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/scenario.yaml`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/alert.bicep`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/query.kql`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.ps1`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.ps1`
- Create: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/README.md`

- [ ] **Step 1: Remove the SQL/canary and red-button scenarios**

Run:

```bash
git rm -r \
  scenarios/cloud-agent-handover/scenarios/canary-bad-release \
  scenarios/cloud-agent-handover/scenarios/red-button-500
```

- [ ] **Step 2: Scaffold the replacement scenario**

Run:

```bash
scripts/new-scenario.sh appservice cloud-agent-handover "SRE Agent to Copilot Handover"
rm -f \
  scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/remediate.sh \
  scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/remediate.ps1
```

Expected: the scenario directory contains the canonical manifest, scripts, alert, query, and README files.

- [ ] **Step 3: Define the manifest without a remediation action**

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/scenario.yaml`:

```yaml
id: cloud-agent-handover
title: SRE Agent to Copilot Handover
track: appservice
summary: A Blazor app ships one unfinished endpoint. A button-generated burst of HTTP 500 responses alerts the SRE Agent, which investigates and, after learner approval, creates an issue assigned to Copilot for the code fix.
severity: 2
estimatedMinutes: 20
difficulty: beginner
learningObjectives:
  - Observe a route-specific HTTP 500 alert become an SRE Agent incident.
  - Approve a structured GitHub issue handoff from the SRE Agent to Copilot.
  - Merge the Cloud Agent pull request and watch OIDC deployment restore the endpoint.
signal:
  alertModule: alert.bicep
  alertName: unfinished-feature-5xx
inject:
  bash: inject.sh
  powershell: inject.ps1
validate:
  bash: validate.sh
  powershell: validate.ps1
investigation:
  query: query.kql
docPage: README.md
```

- [ ] **Step 4: Add the route-specific alert**

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/alert.bicep`:

```bicep
param location string
param workloadName string
param tags object
param scopeResourceId string

resource unfinishedFeatureAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-unfinished-feature-5xx'
  location: location
  tags: tags
  properties: {
    displayName: 'Unfinished feature returns HTTP 500'
    description: 'Fires when POST /api/feature records more than three failures in five minutes.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    scopes: [
      scopeResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''
            AppRequests
            | where TimeGenerated > ago(5m)
            | where Name contains "POST /api/feature" or Url endswith "/api/feature"
            | where Success == false or toint(ResultCode) >= 500
            | summarize Failures = count()
          '''
          timeAggregation: 'Total'
          metricMeasureColumn: 'Failures'
          operator: 'GreaterThan'
          threshold: 3
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
  }
}
```

- [ ] **Step 5: Add the investigation query**

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/query.kql`:

```kusto
// Failed feature requests and their operation identifiers.
AppRequests
| where TimeGenerated > ago(30m)
| where Name contains "POST /api/feature" or Url endswith "/api/feature"
| where Success == false or toint(ResultCode) >= 500
| project TimeGenerated, Name, Url, ResultCode, Success, OperationId
| order by TimeGenerated desc

// Correlate the request OperationId with the intentional missing implementation.
// AppExceptions
// | where TimeGenerated > ago(30m)
// | where ExceptionType endswith "NotImplementedException"
// | project TimeGenerated, ExceptionType, OuterMessage, OperationId
// | order by TimeGenerated desc
```

- [ ] **Step 6: Implement Bash injection and validation**

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"
ATTEMPTS=6

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -a|--app-name) WEB_APP="$2"; shift 2 ;;
    -n|--attempts) ATTEMPTS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list --resource-group "$RESOURCE_GROUP" --query '[0].name' -o tsv)
fi

if [ -z "$WEB_APP" ]; then
  echo "No web app found in $RESOURCE_GROUP" >&2
  exit 1
fi

HOST=$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP" --query defaultHostName -o tsv)

for attempt in $(seq 1 "$ATTEMPTS"); do
  CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "https://$HOST/api/feature")
  echo "POST https://$HOST/api/feature -> $CODE"
done

echo "Generated $ATTEMPTS unfinished-feature requests. The initial application should return HTTP 500."
```

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-srelabapp}"
WEB_APP="${AZURE_WEBAPP_NAME:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -g|--resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    -a|--app-name) WEB_APP="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$WEB_APP" ]; then
  WEB_APP=$(az webapp list --resource-group "$RESOURCE_GROUP" --query '[0].name' -o tsv)
fi

HOST=$(az webapp show --resource-group "$RESOURCE_GROUP" --name "$WEB_APP" --query defaultHostName -o tsv)
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT
CODE=$(curl -sS -o "$BODY" -w '%{http_code}' -X POST "https://$HOST/api/feature")

if [ "$CODE" != "200" ]; then
  echo "Degraded: POST /api/feature returned HTTP $CODE" >&2
  exit 1
fi

jq -e '
  .status == "completed" and
  .message == "The unfinished feature is now implemented."
' "$BODY" >/dev/null

echo "Healthy: POST /api/feature returned the implemented HTTP 200 contract."
```

- [ ] **Step 7: Implement equivalent PowerShell injection and validation**

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.ps1`:

```powershell
#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME,
    [int]$Attempts = 6
)

$ErrorActionPreference = "Stop"

if (-not $AppName) {
    $AppName = az webapp list --resource-group $ResourceGroup --query "[0].name" -o tsv
}
if (-not $AppName) {
    throw "No web app found in $ResourceGroup"
}

$hostName = az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv

1..$Attempts | ForEach-Object {
    $response = Invoke-WebRequest `
        -Method Post `
        -Uri "https://$hostName/api/feature" `
        -SkipHttpErrorCheck
    Write-Host "POST https://$hostName/api/feature -> $($response.StatusCode)"
}

Write-Host "Generated $Attempts unfinished-feature requests. The initial application should return HTTP 500."
```

Replace `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.ps1`:

```powershell
#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" }),
    [string]$AppName = $env:AZURE_WEBAPP_NAME
)

$ErrorActionPreference = "Stop"

if (-not $AppName) {
    $AppName = az webapp list --resource-group $ResourceGroup --query "[0].name" -o tsv
}
if (-not $AppName) {
    throw "No web app found in $ResourceGroup"
}

$hostName = az webapp show --resource-group $ResourceGroup --name $AppName --query defaultHostName -o tsv
$response = Invoke-WebRequest `
    -Method Post `
    -Uri "https://$hostName/api/feature" `
    -SkipHttpErrorCheck

if ($response.StatusCode -ne 200) {
    throw "Degraded: POST /api/feature returned HTTP $($response.StatusCode)"
}

$payload = $response.Content | ConvertFrom-Json
if (
    $payload.status -ne "completed" -or
    $payload.message -ne "The unfinished feature is now implemented."
) {
    throw "POST /api/feature returned an unexpected response contract"
}

Write-Host "Healthy: POST /api/feature returned the implemented HTTP 200 contract."
```

- [ ] **Step 8: Make Bash scripts executable and validate the scenario**

Run:

```bash
chmod +x \
  scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh \
  scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Expected: `Scenario validation passed`.

- [ ] **Step 9: Commit the scenario slice**

Run:

```bash
git add scenarios/cloud-agent-handover/scenarios scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep scenarios/cloud-agent-handover/README.md
git commit -m "feat(appservice): add cloud agent handover scenario"
```

## Task 4: Add idempotent local setup and cleanup

**Files:**
- Create: `scenarios/cloud-agent-handover/scripts/setup.sh`
- Create: `scenarios/cloud-agent-handover/scripts/setup.ps1`
- Create: `scenarios/cloud-agent-handover/scripts/cleanup.sh`
- Create: `scenarios/cloud-agent-handover/scripts/cleanup.ps1`

- [ ] **Step 1: Implement Bash setup**

Create `scenarios/cloud-agent-handover/scripts/setup.sh` with these concrete behaviors:

```bash
#!/usr/bin/env bash
set -euo pipefail

LOCATION="eastus2"
WORKLOAD="srelabapp"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -l|--location) LOCATION="$2"; shift 2 ;;
    -w|--workload) WORKLOAD="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

for command in az gh dotnet zip jq; do
  command -v "$command" >/dev/null || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done

az account show >/dev/null
gh auth status >/dev/null

case "$LOCATION" in
  eastus2|swedencentral|australiaeast) ;;
  *) echo "Unsupported SRE Agent region: $LOCATION" >&2; exit 1 ;;
esac

REPOSITORY=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
IS_TEMPLATE=$(gh api "repos/$REPOSITORY" --jq .is_template)
if [ "$IS_TEMPLATE" = "true" ]; then
  echo "Create a repository with 'Use this template', clone it, and run setup there." >&2
  exit 1
fi

COPILOT_ASSIGNABLE=$(gh api graphql \
  -f query='
    query($owner:String!, $name:String!) {
      repository(owner:$owner, name:$name) {
        suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:100) {
          nodes { login }
        }
      }
    }' \
  -f owner="${REPOSITORY%%/*}" \
  -f name="${REPOSITORY#*/}" \
  --jq '.data.repository.suggestedActors.nodes[].login' \
  | grep -Fx 'copilot-swe-agent' || true)
if [ -z "$COPILOT_ASSIGNABLE" ]; then
  echo "Copilot coding agent is not assignable in $REPOSITORY. Enable it before setup." >&2
  exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
RESOURCE_GROUP="rg-$WORKLOAD"

for provider in Microsoft.Web Microsoft.Insights Microsoft.OperationalInsights Microsoft.ManagedIdentity; do
  az provider register --namespace "$provider" --wait
done

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags workshop=sre-agent environment=demo \
  --output none

OUTPUTS=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file scenarios/cloud-agent-handover/infra/bicep/main.bicep \
  --parameters \
    location="$LOCATION" \
    workloadName="$WORKLOAD" \
    githubRepository="$REPOSITORY" \
  --query properties.outputs \
  --output json)

WEB_APP=$(jq -r '.webAppName.value' <<<"$OUTPUTS")
WEB_HOST=$(jq -r '.webAppHostName.value' <<<"$OUTPUTS")
CLIENT_ID=$(jq -r '.deploymentClientId.value' <<<"$OUTPUTS")

PUBLISH_DIR=$(mktemp -d)
trap 'rm -rf "$PUBLISH_DIR"' EXIT
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
  --configuration Release \
  --output "$PUBLISH_DIR/publish"
(cd "$PUBLISH_DIR/publish" && zip -qr "$PUBLISH_DIR/app.zip" .)

az webapp deploy \
  --resource-group "$RESOURCE_GROUP" \
  --name "$WEB_APP" \
  --src-path "$PUBLISH_DIR/app.zip" \
  --type zip \
  --output none

gh variable set AZURE_CLIENT_ID --body "$CLIENT_ID"
gh variable set AZURE_TENANT_ID --body "$TENANT_ID"
gh variable set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"
gh variable set AZURE_RESOURCE_GROUP --body "$RESOURCE_GROUP"
gh variable set AZURE_WEBAPP_NAME --body "$WEB_APP"
gh variable set AZURE_LOCATION --body "$LOCATION"
gh variable set WORKLOAD_NAME --body "$WORKLOAD"

echo "Application: https://$WEB_HOST"
echo "Health:      https://$WEB_HOST/health"
echo "Repository:  $REPOSITORY"
```

- [ ] **Step 2: Implement PowerShell setup with the same contract**

Create `scenarios/cloud-agent-handover/scripts/setup.ps1` using:

```powershell
#!/usr/bin/env pwsh
param(
    [ValidateSet("eastus2", "swedencentral", "australiaeast")]
    [string]$Location = "eastus2",
    [string]$Workload = "srelabapp"
)

$ErrorActionPreference = "Stop"

foreach ($command in @("az", "gh", "dotnet")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $command"
    }
}

az account show | Out-Null
gh auth status | Out-Null

$repository = gh repo view --json nameWithOwner --jq .nameWithOwner
$isTemplate = gh api "repos/$repository" --jq .is_template
if ($isTemplate -eq "true") {
    throw "Create a repository with 'Use this template', clone it, and run setup there."
}

$owner, $name = $repository.Split("/", 2)
$query = @'
query($owner:String!, $name:String!) {
  repository(owner:$owner, name:$name) {
    suggestedActors(capabilities:[CAN_BE_ASSIGNED], first:100) {
      nodes { login }
    }
  }
}
'@
$actors = gh api graphql `
    -f query=$query `
    -f owner=$owner `
    -f name=$name `
    --jq ".data.repository.suggestedActors.nodes[].login"
if ($actors -notcontains "copilot-swe-agent") {
    throw "Copilot coding agent is not assignable in $repository. Enable it before setup."
}

$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv
$resourceGroup = "rg-$Workload"

foreach ($provider in @(
    "Microsoft.Web",
    "Microsoft.Insights",
    "Microsoft.OperationalInsights",
    "Microsoft.ManagedIdentity"
)) {
    az provider register --namespace $provider --wait
}

az group create `
    --name $resourceGroup `
    --location $Location `
    --tags workshop=sre-agent environment=demo `
    --output none

$outputsJson = az deployment group create `
    --resource-group $resourceGroup `
    --template-file scenarios/cloud-agent-handover/infra/bicep/main.bicep `
    --parameters location=$Location workloadName=$Workload githubRepository=$repository `
    --query properties.outputs `
    --output json
$outputs = $outputsJson | ConvertFrom-Json

$webApp = $outputs.webAppName.value
$webHost = $outputs.webAppHostName.value
$clientId = $outputs.deploymentClientId.value
$publishRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-handover-$([Guid]::NewGuid())"

try {
    dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
    dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj `
        --configuration Release `
        --output "$publishRoot/publish"
    Compress-Archive -Path "$publishRoot/publish/*" -DestinationPath "$publishRoot/app.zip"

    az webapp deploy `
        --resource-group $resourceGroup `
        --name $webApp `
        --src-path "$publishRoot/app.zip" `
        --type zip `
        --output none
}
finally {
    Remove-Item $publishRoot -Recurse -Force -ErrorAction SilentlyContinue
}

gh variable set AZURE_CLIENT_ID --body $clientId
gh variable set AZURE_TENANT_ID --body $tenantId
gh variable set AZURE_SUBSCRIPTION_ID --body $subscriptionId
gh variable set AZURE_RESOURCE_GROUP --body $resourceGroup
gh variable set AZURE_WEBAPP_NAME --body $webApp
gh variable set AZURE_LOCATION --body $Location
gh variable set WORKLOAD_NAME --body $Workload

Write-Host "Application: https://$webHost"
Write-Host "Health:      https://$webHost/health"
Write-Host "Repository:  $repository"
```

- [ ] **Step 3: Implement cleanup scripts**

Create `scenarios/cloud-agent-handover/scripts/cleanup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="${1:-${AZURE_RESOURCE_GROUP:-rg-srelabapp}}"
az group delete --name "$RESOURCE_GROUP" --yes --no-wait
echo "Deletion started for $RESOURCE_GROUP."
```

Create `scenarios/cloud-agent-handover/scripts/cleanup.ps1`:

```powershell
#!/usr/bin/env pwsh
param(
    [string]$ResourceGroup = $(if ($env:AZURE_RESOURCE_GROUP) { $env:AZURE_RESOURCE_GROUP } else { "rg-srelabapp" })
)

$ErrorActionPreference = "Stop"
az group delete --name $ResourceGroup --yes --no-wait
Write-Host "Deletion started for $ResourceGroup."
```

- [ ] **Step 4: Validate script syntax**

Run:

```bash
chmod +x scenarios/cloud-agent-handover/scripts/setup.sh scenarios/cloud-agent-handover/scripts/cleanup.sh
bash -n scenarios/cloud-agent-handover/scripts/setup.sh
bash -n scenarios/cloud-agent-handover/scripts/cleanup.sh
pwsh -NoProfile -Command \
  '[System.Management.Automation.Language.Parser]::ParseFile("scenarios/cloud-agent-handover/scripts/setup.ps1",[ref]$null,[ref]$null) | Out-Null'
pwsh -NoProfile -Command \
  '[System.Management.Automation.Language.Parser]::ParseFile("scenarios/cloud-agent-handover/scripts/cleanup.ps1",[ref]$null,[ref]$null) | Out-Null'
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit local automation**

Run:

```bash
git add scenarios/cloud-agent-handover/scripts
git commit -m "feat(appservice): automate local setup and OIDC"
```

## Task 5: Replace App Service workflows

**Files:**
- Delete: `.github/workflows/deploy-appservice-infra.yml`
- Modify: `.github/workflows/deploy-appservice-app.yml`
- Modify: `.github/workflows/validate-appservice-infra.yml`
- Create: `.github/workflows/validate-appservice-app.yml`

- [ ] **Step 1: Remove the obsolete infrastructure deployment workflow**

Run:

```bash
git rm .github/workflows/deploy-appservice-infra.yml
```

- [ ] **Step 2: Add pull-request application validation**

Create `.github/workflows/validate-appservice-app.yml`:

```yaml
name: Validate Cloud Agent Handover Application

on:
  pull_request:
    paths:
      - 'scenarios/cloud-agent-handover/src/**'
      - 'scenarios/cloud-agent-handover/tests/**'
      - '.github/workflows/validate-appservice-app.yml'
  push:
    branches: [main]
    paths:
      - 'scenarios/cloud-agent-handover/tests/**'
      - '.github/workflows/validate-appservice-app.yml'

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - run: dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
```

- [ ] **Step 3: Replace the post-merge application deployment workflow**

Replace `.github/workflows/deploy-appservice-app.yml`:

```yaml
name: Deploy Cloud Agent Handover Application

on:
  push:
    branches: [main]
    paths:
      - 'scenarios/cloud-agent-handover/src/**'
      - 'scenarios/cloud-agent-handover/tests/**'
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Test
        run: dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj

      - name: Publish
        run: |
          dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
            --configuration Release \
            --output publish
          cd publish
          zip -qr ../app.zip .

      - name: Azure login with OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy application
        run: |
          az webapp deploy \
            --resource-group "${{ vars.AZURE_RESOURCE_GROUP }}" \
            --name "${{ vars.AZURE_WEBAPP_NAME }}" \
            --src-path app.zip \
            --type zip \
            --output none
```

- [ ] **Step 4: Keep infrastructure validation credential-free**

Replace `.github/workflows/validate-appservice-infra.yml`:

```yaml
name: Validate Cloud Agent Handover Infrastructure

on:
  push:
    branches: [main]
    paths:
      - 'scenarios/cloud-agent-handover/infra/**'
      - '.github/workflows/validate-appservice-infra.yml'
  pull_request:
    paths:
      - 'scenarios/cloud-agent-handover/infra/**'
      - '.github/workflows/validate-appservice-infra.yml'

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: az bicep build --file scenarios/cloud-agent-handover/infra/bicep/main.bicep --stdout >/dev/null
```

- [ ] **Step 5: Commit workflow changes**

Run:

```bash
git add .github/workflows
git commit -m "ci(appservice): deploy merged fixes with OIDC"
```

## Task 6: Rewrite the SRE Agent guidance and scenario walkthrough

**Files:**
- Modify: `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`
- Modify: `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/README.md`
- Modify: `docs/connect-github-to-sre-agent.md`

- [ ] **Step 1: Replace the operational guidance**

Write `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md` with these exact rules:

```markdown
# App Service Handover Operational Guidelines

## Purpose

This workshop demonstrates an approval-gated handoff from the Azure SRE Agent to GitHub Copilot coding agent.

## Incident policy

1. Investigate the alert before proposing a fix.
2. Correlate failed `POST /api/feature` requests with `NotImplementedException` telemetry and the connected repository.
3. Do not modify Azure resources or repository code directly.
4. Present the diagnosis and ask the operator for explicit approval before creating a GitHub issue.
5. After approval, create one issue and assign it to `copilot-swe-agent`.
6. Do not create a branch, open a pull request yourself, merge a pull request, or deploy a change.

## Required issue content

- Route: `POST /api/feature`
- Current behavior: HTTP 500 caused by the intentionally unfinished handler
- Expected behavior: HTTP 200
- Expected JSON:

  ```json
  {
    "status": "completed",
    "message": "The unfinished feature is now implemented."
  }
  ```

- Preserve `GET /health`
- Replace the broken-behavior endpoint test with tests for the success contract
- Keep the pull request code-only; do not modify Bicep or workflows

## Recovery

The operator reviews and merges the Copilot pull request. The `Deploy Cloud Agent Handover Application` workflow deploys the merged application through GitHub OIDC. Confirm recovery with the scenario validation script and close the incident only after `POST /api/feature` returns the documented HTTP 200 response.
```

- [ ] **Step 2: Write the attendee scenario README**

Use this structure in `scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/README.md`:

```markdown
# Scenario: SRE Agent to Copilot Handover

## What breaks

The Blazor page is healthy, but `POST /api/feature` throws `NotImplementedException` and returns HTTP 500. One button click generates six requests so the route-specific Azure Monitor alert triggers reliably.

## Trigger the incident

Open the application URL printed by `scenarios/cloud-agent-handover/scripts/setup.sh` or `setup.ps1`, then click **Run unfinished feature** once.

For a facilitator-driven run:

```bash
scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh
```

## Watch the handoff

1. Open the incident in the SRE Agent portal.
2. Confirm the investigation cites failed `/api/feature` requests and the unfinished handler.
3. Approve the proposed GitHub issue.
4. Open the issue in the generated repository and confirm it is assigned to Copilot.
5. Wait for the Copilot pull request.
6. Review the code and test changes.
7. Merge the pull request.
8. Watch **Deploy Cloud Agent Handover Application** complete.

## Validate recovery

```bash
scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh
```

Expected: `Healthy: POST /api/feature returned the implemented HTTP 200 contract.`
```

- [ ] **Step 3: Update the shared GitHub connector guide**

In `docs/connect-github-to-sre-agent.md`:

- Change learner repository language from “fork” to “repository created from the template”.
- State that App Service requires the Code integration and GitHub connector.
- State that the App Service policy requires approval before issue creation.
- Name the assignable coding-agent account `copilot-swe-agent`, while explaining that the GitHub UI labels it as Copilot.
- Keep AKS and VM behavior accurate.

- [ ] **Step 4: Commit the handoff guidance**

Run:

```bash
git add scenarios/cloud-agent-handover/knowledge scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/README.md docs/connect-github-to-sre-agent.md
git commit -m "docs(appservice): define approval-gated copilot handoff"
```

## Task 7: Rewrite the App Service learner path

**Files:**
- Modify: `scenarios/cloud-agent-handover/README.md`
- Modify: `scenarios/cloud-agent-handover/docs/00-prerequisites.md`
- Modify: `scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md`
- Modify: `scenarios/cloud-agent-handover/docs/02-deploy-application.md`
- Modify: `scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md`
- Modify: `scenarios/cloud-agent-handover/docs/04-configure-incident-response.md`
- Modify: `scenarios/cloud-agent-handover/docs/90-watch-sre-agent.md`
- Modify: `scenarios/cloud-agent-handover/docs/99-cleanup.md`

- [ ] **Step 1: Make the track README a short linear quickstart**

Rewrite `scenarios/cloud-agent-handover/README.md` so it contains:

- Title: `App Service: SRE Agent to Copilot Handover`.
- A one-paragraph explanation of the demo.
- Estimated time: 30–45 minutes after product access is available.
- Minimal Azure resource/cost table: B1 App Service, Log Analytics/Application Insights, SRE Agent.
- Module links in this order:
  `00-prerequisites`, `01-deploy-infrastructure`, `02-deploy-application`,
  `03-onboard-sre-agent`, `04-configure-incident-response`, `90-watch-sre-agent`, `99-cleanup`.
- The generated scenario markers unchanged.
- A statement that setup is local and merged application changes deploy automatically.

- [ ] **Step 2: Rewrite prerequisites and setup modules**

`00-prerequisites.md` must require:

- Repository created with **Use this template** and cloned locally.
- Azure subscription with Contributor plus Owner/User Access Administrator at the workshop resource-group scope to create the Website Contributor role assignment.
- SRE Agent product access.
- GitHub Copilot coding agent enabled and assignable.
- Azure CLI, GitHub CLI, .NET 10, `zip`, and `jq` for Bash; PowerShell 7 for Windows.
- `az login`, `gh auth login`, and `gh auth refresh -s read:org,repo`.

`01-deploy-infrastructure.md` must run:

```bash
scenarios/cloud-agent-handover/scripts/setup.sh
```

and:

```powershell
./scenarios/cloud-agent-handover/scripts/setup.ps1
```

Explain that the same command deploys infrastructure, configures repository-bound OIDC, writes GitHub variables, tests the app, and deploys the initial build.

`02-deploy-application.md` must:

- Open the printed application URL.
- Verify `/health`.
- Explain that the initial unfinished endpoint intentionally returns 500.
- Explain that later merges to `main` trigger `Deploy Cloud Agent Handover Application`.

- [ ] **Step 3: Rewrite onboarding and incident-response modules**

`03-onboard-sre-agent.md` must:

- Connect the generated repository through the Code card.
- Upload `scenarios/cloud-agent-handover/knowledge/operational-guidelines.md`.
- Connect the Azure resource group and monitoring resources.

`04-configure-incident-response.md` must:

- Add the GitHub OAuth connector.
- Confirm the connector can create issues in the generated repository.
- Require Review/approval behavior before issue creation.
- Include a readiness check that Copilot appears as an assignable actor.

- [ ] **Step 4: Rewrite observation and cleanup modules**

`90-watch-sre-agent.md` must describe only observable stages:

1. Click button.
2. Wait for Azure Monitor evaluation without promising exact timing.
3. Inspect request and exception evidence.
4. Approve issue creation.
5. Review the Copilot PR.
6. Merge.
7. Observe OIDC deployment.
8. Run scenario validation and confirm alert recovery.

`99-cleanup.md` must run:

```bash
scenarios/cloud-agent-handover/scripts/cleanup.sh
```

and:

```powershell
./scenarios/cloud-agent-handover/scripts/cleanup.ps1
```

Explain that the resource group contains the web app, monitoring, deployment identity, and federated credential. Remove all service-principal-secret and fork cleanup language.

- [ ] **Step 5: Regenerate the App Service README scenario table**

Run:

```bash
scripts/validate-scenarios.sh --write
```

- [ ] **Step 6: Commit the learner documentation**

Run:

```bash
git add scenarios/cloud-agent-handover
git commit -m "docs(appservice): streamline the handover workshop"
```

## Task 8: Make App Service the template quickstart

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.devcontainer/cloud-agent-handover/devcontainer.json`

- [ ] **Step 1: Update the root README**

Change `README.md` so:

- The opening describes the App Service handover as the fastest path.
- **Start here** begins with:

  ```markdown
  1. Click **Use this template** on GitHub.
  2. Create and clone your repository.
  3. Run `scenarios/cloud-agent-handover/scripts/setup.sh` or `setup.ps1`.
  4. Follow [App Service: SRE Agent to Copilot Handover](scenarios/cloud-agent-handover/README.md).
  ```

- The track table lists App Service first and labels it `Beginner / recommended`.
- AKS and VM remain available as advanced tracks.
- “Fork” language is removed from the quickstart.
- The App Service scenario index is added to “Scenarios at a glance”.
- The repository structure includes `scenarios/cloud-agent-handover/`.

- [ ] **Step 2: Correct contribution guidance**

In `CONTRIBUTING.md`:

- Change the scaffold track set from `aks|vm` to `aks|vm|appservice`.
- Keep the generated-artifact rules.
- Clarify that remediation is optional and that basename-equals-action is VM-specific.
- Keep the App Service `logAnalyticsResourceId` track registration documented.

- [ ] **Step 3: Update the App Service dev container**

Replace the restore command in `.devcontainer/cloud-agent-handover/devcontainer.json`:

```json
"onCreateCommand": "sudo apt-get update && sudo apt-get install -y jq zip",
"postCreateCommand": "npm --prefix scripts/scenario-tools ci && dotnet restore scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj"
```

Retain Azure CLI/Bicep, PowerShell, GitHub CLI, Node, jq, and .NET 10.

- [ ] **Step 4: Commit template-oriented repository docs**

Run:

```bash
git add README.md CONTRIBUTING.md .devcontainer/cloud-agent-handover/devcontainer.json
git commit -m "docs: make app service the template quickstart"
```

## Task 9: Add framework coverage for remediation-free scenarios

**Files:**
- Modify: `scripts/scenario-tools/test/validate.test.js`
- Modify only if tests expose a bug: `scripts/scenario-tools/lib/validate.js`

- [ ] **Step 1: Add a test proving remediation is optional**

Append to `scripts/scenario-tools/test/validate.test.js`:

```javascript
test('scenario without remediation is valid', () => {
  const manifest = {
    ...baseManifest,
    id: 'cloud-agent-handover',
    title: 'SRE Agent to Copilot Handover',
    track: 'appservice',
  };
  const files = new Set([
    'inject.sh',
    'inject.ps1',
    'validate.sh',
    'validate.ps1',
    'scenario.yaml',
    'README.md',
  ]);

  const errs = checkScenario(
    {
      track: 'appservice',
      id: 'cloud-agent-handover',
      manifest,
      dir: '/x/cloud-agent-handover',
    },
    { fileExists: (path) => files.has(path.split('/').pop()) }
  );

  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: Run the scenario tooling tests**

Run:

```bash
cd scripts/scenario-tools && npm test
```

Expected: all tests pass. Do not change `validate.js` unless this test reveals an actual regression.

- [ ] **Step 3: Commit framework coverage**

Run:

```bash
git add scripts/scenario-tools/test/validate.test.js scripts/scenario-tools/lib/validate.js
git commit -m "test(scenarios): cover remediation-free handoffs"
```

## Task 10: Run complete repository validation

**Files:**
- Generated: `scenarios/cloud-agent-handover/scenarios/INDEX.md`
- Generated: `scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep`
- Generated section: `scenarios/cloud-agent-handover/README.md`

- [ ] **Step 1: Regenerate and validate scenario artifacts**

Run:

```bash
scripts/validate-scenarios.sh --write
scripts/validate-scenarios.sh
```

Expected: `Scenario validation passed`.

- [ ] **Step 2: Run scenario tooling tests**

Run:

```bash
cd scripts/scenario-tools && npm test
```

Expected: all Node tests pass.

- [ ] **Step 3: Build all App Service Bicep**

Run:

```bash
az bicep build --file scenarios/cloud-agent-handover/infra/bicep/main.bicep --stdout >/dev/null
az bicep build --file scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/alert.bicep --stdout >/dev/null
az bicep build --file scenarios/cloud-agent-handover/infra/bicep/modules/scenario-alerts.bicep --stdout >/dev/null
```

Expected: all three commands exit 0.

- [ ] **Step 4: Build and test the application**

Run:

```bash
dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj
dotnet publish scenarios/cloud-agent-handover/src/HandoverApp.csproj \
  --configuration Release \
  --output /tmp/sre-handover-publish
rm -rf /tmp/sre-handover-publish
```

Expected: tests and publish pass.

- [ ] **Step 5: Validate script syntax and stale references**

Run:

```bash
bash -n scenarios/cloud-agent-handover/scripts/setup.sh
bash -n scenarios/cloud-agent-handover/scripts/cleanup.sh
bash -n scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/inject.sh
bash -n scenarios/cloud-agent-handover/scenarios/cloud-agent-handover/validate.sh
pwsh -NoProfile -Command \
  'Get-ChildItem scenarios/cloud-agent-handover -Recurse -Filter *.ps1 | ForEach-Object { [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$null) | Out-Null }'
rg -n 'Azure SQL|canary-bad-release|red-button-500|AZURE_CREDENTIALS|Deploy Cloud Agent Handover Infrastructure|fork your|your fork' \
  README.md CONTRIBUTING.md docs/connect-github-to-sre-agent.md scenarios/cloud-agent-handover .github/workflows .devcontainer/cloud-agent-handover
```

Expected: parser commands pass and `rg` returns no stale App Service guidance. Review any legitimate historical design documents separately rather than editing them.

- [ ] **Step 6: Review the full diff**

Run:

```bash
git --no-pager diff --check
git --no-pager status --short
git --no-pager diff --stat origin/main...HEAD
```

Expected: no whitespace errors; only intended App Service, shared docs, workflow, scenario-tool test, and generated files are changed.

- [ ] **Step 7: Commit generated and validation fixes**

Run:

```bash
git add -A
git commit -m "chore(appservice): finalize handover workshop"
```

Skip the commit only if validation produced no additional changes.

## Task 11: Perform the Azure/GitHub end-to-end rehearsal

**Files:**
- Modify only when rehearsal exposes defects in the files above.

- [ ] **Step 1: Create a disposable repository from the template candidate**

Use a private disposable repository owned by the implementer. Confirm it is not marked as a template and that Copilot coding agent appears in the `suggestedActors` query.

- [ ] **Step 2: Run local setup**

Run from the disposable repository:

```bash
scenarios/cloud-agent-handover/scripts/setup.sh --location eastus2 --workload srehandoff
```

Expected:

- Resource group `rg-srehandoff` exists.
- App Service, monitoring, deployment identity, FIC, and role assignment exist.
- Repository variables are populated.
- `/health` returns HTTP 200.
- `/api/feature` returns HTTP 500.

- [ ] **Step 3: Trigger and inspect the alert**

Click **Run unfinished feature** once. Confirm six failed requests appear in Application Insights and the alert becomes active after Azure Monitor evaluation.

- [ ] **Step 4: Rehearse the approval-gated handoff**

In the SRE Agent:

1. Confirm it cites `/api/feature`, `NotImplementedException`, and the source handler.
2. Confirm it asks for approval before creating the issue.
3. Approve the issue.
4. Confirm the issue contains the exact JSON acceptance contract and is assigned to `copilot-swe-agent`.

- [ ] **Step 5: Verify the Copilot pull request**

The pull request should make the minimal code/test change:

```csharp
static IResult HandleFeature() => Results.Ok(new
{
    status = "completed",
    message = "The unfinished feature is now implemented."
});
```

and change the endpoint test to assert HTTP 200 plus the exact JSON response.

- [ ] **Step 6: Merge and verify OIDC deployment**

Merge the pull request. Confirm:

- `Validate Cloud Agent Handover Application` passed on the pull request.
- `Deploy Cloud Agent Handover Application` authenticated without `AZURE_CREDENTIALS`.
- The deployment completed.
- `validate.sh` passes.
- The Azure Monitor alert auto-mitigates.

- [ ] **Step 7: Clean up the rehearsal**

Run:

```bash
scenarios/cloud-agent-handover/scripts/cleanup.sh rg-srehandoff
```

Delete the disposable GitHub repository after preserving any defect notes.

## Task 12: Enable the upstream repository as a GitHub template

**Files:**
- No repository files.

- [ ] **Step 1: Confirm the implementation branch is merged**

Run:

```bash
gh pr status
git status --short
```

Expected: the implementation is merged to `main` and the worktree is clean.

- [ ] **Step 2: Enable the template repository setting**

Run:

```bash
gh api \
  --method PATCH \
  repos/JoranBergfeld/sre-agent-workshop \
  -F is_template=true
```

Expected: the response contains `"is_template": true`.

- [ ] **Step 3: Verify the GitHub UI**

Open `https://github.com/JoranBergfeld/sre-agent-workshop` and confirm **Use this template** is visible. Create one final disposable repository and verify workflow files are copied while repository variables are empty until setup runs.
