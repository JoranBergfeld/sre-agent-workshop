# App Service Track Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a third workshop track, `appservice`, hosting a .NET 10 shop on Azure App Service (Linux) backed by Azure SQL Database, wired into the scenario framework — with **zero scenarios** (the break scenario is a later cycle).

**Architecture:** Bicep `main.bicep` composes `monitoring → identity → sql → appservice` modules (mirroring the AKS track). The shop authenticates to Azure SQL passwordlessly via a user-assigned managed identity (AAD auth); a least-privilege contained DB user is granted in CI via `sqlcmd`. Delivery is native .NET 10 (`dotnet publish` → `az webapp deploy --type zip`, build-on-deploy off). Telemetry flows to one workspace-based App Insights + Log Analytics workspace.

**Tech Stack:** Bicep, Azure App Service (Linux, B1), Azure SQL Database (Basic), .NET 10 minimal API, `Microsoft.Data.SqlClient`, Application Insights, GitHub Actions, Node-based scenario tooling.

**Execution note — verification-driven, not red-green TDD:** the deliverables are infrastructure-as-code, an app scaffold, SQL scripts, workflows, and docs. There is no app unit-test project (consistent with the sibling AKS/VM tracks and the approved spec, whose acceptance is offline build + framework validation). Each task is verified by a concrete build/compile/validate command, then committed.

**Reference files (read before implementing; do NOT modify):**
- `workshops/aks/infra/bicep/main.bicep`, `.../modules/monitoring.bicep`, `.../modules/identity.bicep`, `workshops/aks/infra/bicep/main.bicepparam`
- `.github/workflows/deploy-aks-infra.yml`, `.../validate-aks-infra.yml`, `.../deploy-aks-app.yml`
- `workshops/aks/knowledge/operational-guidelines.md`, `workshops/aks/README.md`, `workshops/aks/docs/*.md`
- `scripts/scenario-tools/lib/paths.js`, `schemas/scenario.schema.json`

**Environment prerequisites for verification:**
- `az` CLI with Bicep (`az bicep version`) — offline `az bicep build` works (a one-line WARNING about a newer Bicep CLI is normal; only `ERROR` lines fail).
- Node (for `scripts/validate-scenarios.sh` and `npm test`).
- .NET 10 SDK for Task 6. If absent (no sudo on the dev box), install user-local:
  ```bash
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 10.0 --install-dir "$HOME/.dotnet"
  export PATH="$HOME/.dotnet:$PATH"
  dotnet --version   # expect 10.0.x
  ```

---

## Task 1: Register the `appservice` track in the framework

Adds the track to the schema enum and the tooling's `TRACKS` map. Harmless with zero scenarios — `listTracks()` filters by the existence of `workshops/appservice/scenarios/`, which we do **not** create, so the generator/validator skip the track and stay drift-free.

**Files:**
- Modify: `schemas/scenario.schema.json` (line 11)
- Modify: `scripts/scenario-tools/lib/paths.js` (the `TRACKS` object)

- [ ] **Step 1: Add the enum value**

In `schemas/scenario.schema.json`, change:
```json
    "track": { "type": "string", "enum": ["aks", "vm"] },
```
to:
```json
    "track": { "type": "string", "enum": ["aks", "vm", "appservice"] },
```

- [ ] **Step 2: Add the `TRACKS` entry**

In `scripts/scenario-tools/lib/paths.js`, change:
```js
export const TRACKS = {
  aks: { scopeParam: 'clusterId' },
  vm: { scopeParam: 'logAnalyticsResourceId' },
};
```
to:
```js
export const TRACKS = {
  aks: { scopeParam: 'clusterId' },
  vm: { scopeParam: 'logAnalyticsResourceId' },
  appservice: { scopeParam: 'logAnalyticsResourceId' },
};
```

- [ ] **Step 3: Verify the scenario tooling still passes**

Run: `cd scripts/scenario-tools && npm test`
Expected: `tests 13`, `pass 13`, `fail 0`.

- [ ] **Step 4: Verify validation is green with no drift**

Run: `cd "$(git rev-parse --show-toplevel)" && scripts/validate-scenarios.sh && scripts/validate-scenarios.sh --write && git status --porcelain`
Expected: prints `Scenario validation passed`; `git status --porcelain` shows ONLY the two files you edited (no generated-artifact drift), e.g.:
```
 M schemas/scenario.schema.json
 M scripts/scenario-tools/lib/paths.js
```

- [ ] **Step 5: Commit**

```bash
git add schemas/scenario.schema.json scripts/scenario-tools/lib/paths.js
git commit -m "feat(appservice): register appservice track in schema and tooling

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Bicep modules — `monitoring.bicep` and `identity.bicep`

`monitoring.bicep` is reused verbatim from AKS (Log Analytics `${workloadName}-law` + workspace-based App Insights `${workloadName}-ai`; outputs `logAnalyticsId` and `appInsightsConnectionString`). `identity.bicep` is a simplified UAMI-only module (no federated credential, no Cosmos role — those are AKS-specific).

**Files:**
- Create: `workshops/appservice/infra/bicep/modules/monitoring.bicep`
- Create: `workshops/appservice/infra/bicep/modules/identity.bicep`

- [ ] **Step 1: Create `monitoring.bicep`**

```bicep
@description('Azure region for all monitoring resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

// ──────────────────────────────────────────────
// Log Analytics Workspace
// ──────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${workloadName}-law'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ──────────────────────────────────────────────
// Application Insights (workspace-based)
// ──────────────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${workloadName}-ai'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    RetentionInDays: 30
  }
}

// ── Outputs ──────────────────────────────────
@description('Log Analytics workspace resource ID')
output logAnalyticsId string = logAnalytics.id

@description('Log Analytics workspace ID (GUID)')
output logAnalyticsWorkspaceId string = logAnalytics.properties.customerId

@description('Application Insights connection string')
output appInsightsConnectionString string = appInsights.properties.ConnectionString
```

- [ ] **Step 2: Create `identity.bicep`**

```bicep
@description('Azure region for identity resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

// ──────────────────────────────────────────────
// User-Assigned Managed Identity
// Assigned to the App Service and granted a least-privilege
// contained user in Azure SQL (the grant runs in CI, not Bicep).
// ──────────────────────────────────────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${workloadName}-id'
  location: location
  tags: tags
}

// ── Outputs ──────────────────────────────────
@description('User-Assigned Managed Identity client ID')
output uamiClientId string = uami.properties.clientId

@description('User-Assigned Managed Identity principal ID')
output uamiPrincipalId string = uami.properties.principalId

@description('User-Assigned Managed Identity resource ID')
output uamiId string = uami.id
```

- [ ] **Step 3: Verify both modules compile**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
az bicep build --file workshops/appservice/infra/bicep/modules/monitoring.bicep --stdout > /dev/null && echo "monitoring OK"
az bicep build --file workshops/appservice/infra/bicep/modules/identity.bicep --stdout > /dev/null && echo "identity OK"
```
Expected: `monitoring OK` and `identity OK`, no `ERROR` lines.

- [ ] **Step 4: Commit**

```bash
git add workshops/appservice/infra/bicep/modules/monitoring.bicep workshops/appservice/infra/bicep/modules/identity.bicep
git commit -m "feat(appservice): add monitoring and identity bicep modules

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Bicep module — `sql.bicep`

Azure SQL logical server (AAD-only auth, AAD admin = the deploying principal) + a Basic database + the "Allow Azure services" firewall rule.

**Files:**
- Create: `workshops/appservice/infra/bicep/modules/sql.bicep`

- [ ] **Step 1: Create `sql.bicep`**

```bicep
@description('Azure region for SQL resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Deterministic suffix for the globally-unique SQL server name')
param uniqueSuffix string

@description('Object ID of the AAD principal to set as SQL admin (the deploying service principal)')
param sqlAadAdminObjectId string

@description('Login display name for the AAD admin')
param sqlAadAdminLogin string = 'sql-admin'

// ──────────────────────────────────────────────
// SQL logical server — AAD-only authentication
// ──────────────────────────────────────────────
resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: '${workloadName}-sql-${uniqueSuffix}'
  location: location
  tags: tags
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'Application'
      login: sqlAadAdminLogin
      sid: sqlAadAdminObjectId
      tenantId: tenant().tenantId
      azureADOnlyAuthentication: true
    }
  }
}

// ──────────────────────────────────────────────
// Database — Basic tier (5 DTU)
// ──────────────────────────────────────────────
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: '${workloadName}-db'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648
  }
}

// ──────────────────────────────────────────────
// Firewall — allow Azure services (App Service outbound)
// The 0.0.0.0/0.0.0.0 rule is the special "Allow Azure services" entry.
// ──────────────────────────────────────────────
resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAllAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Outputs ──────────────────────────────────
@description('SQL logical server name')
output sqlServerName string = sqlServer.name

@description('SQL server fully-qualified domain name')
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName

@description('SQL database name')
output sqlDatabaseName string = sqlDatabase.name
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && az bicep build --file workshops/appservice/infra/bicep/modules/sql.bicep --stdout > /dev/null && echo "sql OK"`
Expected: `sql OK`, no `ERROR` lines.

- [ ] **Step 3: Commit**

```bash
git add workshops/appservice/infra/bicep/modules/sql.bicep
git commit -m "feat(appservice): add azure sql bicep module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Bicep module — `appservice.bicep`

App Service Plan (B1 Linux) + Web App (assigned the UAMI, `DOTNETCORE|10.0`, HTTPS-only, Always On, health-check `/health`, app settings) + diagnostic settings routing platform logs to the workspace.

> Runtime note: the `linuxFxVersion` value `DOTNETCORE|10.0` is correct for .NET 10. `az bicep build` does not validate the string; confirm against `az webapp list-runtimes --os linux` before a live deploy.

**Files:**
- Create: `workshops/appservice/infra/bicep/modules/appservice.bicep`

- [ ] **Step 1: Create `appservice.bicep`**

```bicep
@description('Azure region for the App Service resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Deterministic suffix for the globally-unique web app name')
param uniqueSuffix string

@description('Resource ID of the user-assigned managed identity to assign')
param uamiId string

@description('Client ID of the user-assigned managed identity (for the SQL connection string)')
param uamiClientId string

@description('SQL server fully-qualified domain name')
param sqlServerFqdn string

@description('SQL database name')
param sqlDatabaseName string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Log Analytics workspace resource ID for diagnostic settings')
param logAnalyticsId string

var sqlConnectionString = 'Server=tcp:${sqlServerFqdn},1433;Database=${sqlDatabaseName};Authentication=Active Directory Managed Identity;User Id=${uamiClientId};Encrypt=True;TrustServerCertificate=False'

// ──────────────────────────────────────────────
// App Service Plan (B1 Linux)
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Web App (.NET 10, passwordless SQL via UAMI)
// ──────────────────────────────────────────────
resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${workloadName}-web-${uniqueSuffix}'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${uamiId}': {}
    }
  }
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
          name: 'AZURE_SQL_CONNECTIONSTRING'
          value: sqlConnectionString
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

// ──────────────────────────────────────────────
// Diagnostic settings → Log Analytics workspace
// ──────────────────────────────────────────────
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

// ── Outputs ──────────────────────────────────
@description('Web App name')
output webAppName string = webApp.name

@description('Web App default host name')
output webAppHostName string = webApp.properties.defaultHostName
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && az bicep build --file workshops/appservice/infra/bicep/modules/appservice.bicep --stdout > /dev/null && echo "appservice OK"`
Expected: `appservice OK`, no `ERROR` lines.

- [ ] **Step 3: Commit**

```bash
git add workshops/appservice/infra/bicep/modules/appservice.bicep
git commit -m "feat(appservice): add app service plan and web app bicep module

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Bicep orchestrator — `main.bicep` + `main.bicepparam`

Composes the four modules, leaves the scenario-alert seam, and exposes outputs the workflows consume.

**Files:**
- Create: `workshops/appservice/infra/bicep/main.bicep`
- Create: `workshops/appservice/infra/bicep/main.bicepparam`

- [ ] **Step 1: Create `main.bicep`**

```bicep
// ──────────────────────────────────────────────────────────────
// Azure SRE Agent Workshop — App Service Track — Main Orchestrator
// Composes: Monitoring → Identity → SQL → App Service → [Alerts seam]
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for all resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelab'

@description('Resource tags applied to every resource')
param tags object = {
  workshop: 'sre-agent'
  environment: 'demo'
}

@description('Object ID of the AAD principal set as SQL admin (the deploying service principal)')
param sqlAadAdminObjectId string

// Deterministic 4-char suffix for globally unique resource names (SQL server, web app)
var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 4)

// ──────────────────────────────────────────────
// 1. Monitoring (Log Analytics + workspace-based App Insights)
// ──────────────────────────────────────────────
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 2. Identity (UAMI assigned to the web app)
// ──────────────────────────────────────────────
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 3. Azure SQL (server + database + firewall)
// ──────────────────────────────────────────────
module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    uniqueSuffix: uniqueSuffix
    sqlAadAdminObjectId: sqlAadAdminObjectId
  }
}

// ──────────────────────────────────────────────
// 4. App Service (plan + web app + diagnostics)
// ──────────────────────────────────────────────
module appservice 'modules/appservice.bicep' = {
  name: 'appservice'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    uniqueSuffix: uniqueSuffix
    uamiId: identity.outputs.uamiId
    uamiClientId: identity.outputs.uamiClientId
    sqlServerFqdn: sql.outputs.sqlServerFqdn
    sqlDatabaseName: sql.outputs.sqlDatabaseName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    logAnalyticsId: monitoring.outputs.logAnalyticsId
  }
}

// ──────────────────────────────────────────────
// 5. SCENARIO ALERTS — wired by first scenario cycle
//    When the first appservice scenario lands, the generator emits
//    modules/scenario-alerts.bicep; add the module call here:
//
//    module scenarioAlerts 'modules/scenario-alerts.bicep' = {
//      name: 'scenario-alerts'
//      params: {
//        location: location
//        workloadName: workloadName
//        tags: tags
//        logAnalyticsResourceId: monitoring.outputs.logAnalyticsId
//      }
//    }
// ──────────────────────────────────────────────

// ── Outputs ──────────────────────────────────
@description('Web App name')
output webAppName string = appservice.outputs.webAppName

@description('Web App default host name')
output webAppHostName string = appservice.outputs.webAppHostName

@description('SQL logical server name')
output sqlServerName string = sql.outputs.sqlServerName

@description('SQL database name')
output sqlDatabaseName string = sql.outputs.sqlDatabaseName

@description('Log Analytics workspace resource ID')
output logAnalyticsId string = monitoring.outputs.logAnalyticsId

@description('User-Assigned Managed Identity client ID')
output uamiClientId string = identity.outputs.uamiClientId

@description('User-Assigned Managed Identity principal ID')
output uamiPrincipalId string = identity.outputs.uamiPrincipalId
```

- [ ] **Step 2: Create `main.bicepparam`**

```bicep
using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelab'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
// Overridden by the deploy workflow with the deploying service principal's object ID.
param sqlAadAdminObjectId = ''
```

- [ ] **Step 3: Verify the full graph compiles**

Run: `cd "$(git rev-parse --show-toplevel)" && az bicep build --file workshops/appservice/infra/bicep/main.bicep --stdout > /dev/null && echo "main OK"`
Expected: `main OK`, no `ERROR` lines. (A single WARNING about a newer Bicep CLI is acceptable.)

- [ ] **Step 4: Commit**

```bash
git add workshops/appservice/infra/bicep/main.bicep workshops/appservice/infra/bicep/main.bicepparam
git commit -m "feat(appservice): add main orchestrator and bicepparam

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: The .NET 10 shop app

A thin minimal API mirroring the AKS app's `/`, `/health`, `/products` shape. `/health` never touches the DB; `/products` reads the catalog via passwordless SQL and returns 500 (logged) on failure.

**Files:**
- Create: `workshops/appservice/src/Shop.csproj`
- Create: `workshops/appservice/src/Program.cs`
- Create: `workshops/appservice/src/Models/Product.cs`
- Create: `workshops/appservice/src/appsettings.json`
- Create: `workshops/appservice/src/global.json`

- [ ] **Step 1: Create `Shop.csproj`**

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace>Shop</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Data.SqlClient" Version="5.2.2" />
    <PackageReference Include="Microsoft.ApplicationInsights.AspNetCore" Version="2.22.0" />
  </ItemGroup>

</Project>
```

- [ ] **Step 2: Create `Models/Product.cs`**

```csharp
namespace Shop.Models;

public record Product(int Id, string Name, decimal Price);
```

- [ ] **Step 3: Create `Program.cs`**

```csharp
using Microsoft.Data.SqlClient;
using Shop.Models;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

var connectionString = Environment.GetEnvironmentVariable("AZURE_SQL_CONNECTIONSTRING") ?? "";

// Health check — intentionally does NOT verify DB connectivity (liveness only)
app.MapGet("/health", () => Results.Json(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Landing page — shows SQL connectivity status
app.MapGet("/", async () =>
{
    string status;
    if (string.IsNullOrEmpty(connectionString))
    {
        status = "not configured (AZURE_SQL_CONNECTIONSTRING not set)";
    }
    else
    {
        try
        {
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync();
            status = "connected";
        }
        catch (Exception ex)
        {
            status = $"disconnected — {ex.Message}";
        }
    }

    var html = $"""
        <!DOCTYPE html>
        <html>
        <head><title>SRE Agent Workshop — Shop</title></head>
        <body>
          <h1>SRE Agent Workshop — Shop</h1>
          <table>
            <tr><td><strong>Azure SQL Status</strong></td><td>{status}</td></tr>
          </table>
        </body>
        </html>
        """;
    return Results.Content(html, "text/html");
});

// Catalog — reads Products from Azure SQL via the managed identity
app.MapGet("/products", async (ILogger<Program> logger) =>
{
    if (string.IsNullOrEmpty(connectionString))
    {
        return Results.Json(new { error = "AZURE_SQL_CONNECTIONSTRING is not set" }, statusCode: 500);
    }

    try
    {
        var products = new List<Product>();
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync();
        await using var cmd = new SqlCommand("SELECT Id, Name, Price FROM dbo.Products ORDER BY Id", conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            products.Add(new Product(reader.GetInt32(0), reader.GetString(1), reader.GetDecimal(2)));
        }
        return Results.Json(products);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to read products from Azure SQL");
        return Results.Json(new { error = $"Failed to connect to Azure SQL: {ex.Message}" }, statusCode: 500);
    }
});

app.Run();
```

- [ ] **Step 4: Create `appsettings.json`**

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

- [ ] **Step 5: Create `global.json`**

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
```

- [ ] **Step 6: Verify the app publishes**

Ensure the .NET 10 SDK is available (see "Environment prerequisites"). Then run:
```bash
cd "$(git rev-parse --show-toplevel)/workshops/appservice/src"
dotnet publish -c Release -o /tmp/shop-publish
```
Expected: `Build succeeded`, ends with `Shop -> /tmp/shop-publish/` and no errors. (NuGet restore runs automatically; requires network for the first restore.)

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add workshops/appservice/src/
git commit -m "feat(appservice): add .NET 10 shop minimal API

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Database scripts — `schema.sql` + `grant.sql`

Idempotent scripts the app-deploy workflow runs via `sqlcmd`. `schema.sql` creates/seeds the catalog; `grant.sql` creates the least-privilege contained user for the UAMI using its client-id SID (`TYPE = E`, no MS-Graph dependency).

**Files:**
- Create: `workshops/appservice/db/schema.sql`
- Create: `workshops/appservice/db/grant.sql`

- [ ] **Step 1: Create `schema.sql`**

```sql
-- Create and seed the product catalog. Idempotent: safe to re-run on every deploy.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Products' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.Products (
        Id    INT IDENTITY(1,1) PRIMARY KEY,
        Name  NVARCHAR(200)  NOT NULL,
        Price DECIMAL(10, 2) NOT NULL
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Products)
BEGIN
    INSERT INTO dbo.Products (Name, Price) VALUES
        (N'Quantum Widget',       19.99),
        (N'Hyperflux Capacitor',  49.50),
        (N'Nano Sprocket',         7.25),
        (N'Plasma Coil',          89.00);
END;
GO
```

- [ ] **Step 2: Create `grant.sql`**

```sql
-- Grant the App Service managed identity least-privilege read access.
-- $(uamiName) and $(uamiSid) are passed as sqlcmd variables by the deploy workflow.
-- Using WITH SID = <client-id bytes>, TYPE = E creates the external-provider user
-- WITHOUT an MS Graph lookup, so the SQL server needs no Directory Readers role.
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$(uamiName)')
BEGIN
    CREATE USER [$(uamiName)] WITH SID = $(uamiSid), TYPE = E;
    ALTER ROLE db_datareader ADD MEMBER [$(uamiName)];
END;
GO
```

- [ ] **Step 3: Verify the files exist and are non-empty**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
test -s workshops/appservice/db/schema.sql && test -s workshops/appservice/db/grant.sql && \
  grep -q "CREATE TABLE dbo.Products" workshops/appservice/db/schema.sql && \
  grep -q "WITH SID = \$(uamiSid), TYPE = E" workshops/appservice/db/grant.sql && \
  echo "db scripts OK"
```
Expected: `db scripts OK`.

- [ ] **Step 4: Commit**

```bash
git add workshops/appservice/db/
git commit -m "feat(appservice): add sql schema and managed-identity grant scripts

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: GitHub Actions workflows

Three workflows mirroring the AKS naming and the manual-dispatch-infra convention. All use the `AZURE_CREDENTIALS` secret.

**Files:**
- Create: `.github/workflows/validate-appservice-infra.yml`
- Create: `.github/workflows/deploy-appservice-infra.yml`
- Create: `.github/workflows/deploy-appservice-app.yml`

- [ ] **Step 1: Create `validate-appservice-infra.yml`**

```yaml
# Validates App Service Bicep on push and pull requests.
# Syntax validation (no creds) + optional what-if when AZURE_CREDENTIALS is set.
name: Validate App Service Infrastructure

on:
  push:
    branches: [main]
    paths: ['workshops/appservice/infra/**']
  pull_request:
    paths: ['workshops/appservice/infra/**']

permissions:
  id-token: write
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    env:
      LOCATION: ${{ vars.AZURE_LOCATION || 'eastus2' }}
      WORKLOAD: ${{ vars.WORKLOAD_NAME || 'srelab' }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Validate Bicep syntax
        run: az bicep build --file workshops/appservice/infra/bicep/main.bicep --stdout > /dev/null

      - name: Azure Login
        id: azure-login
        uses: azure/login@v2
        continue-on-error: true
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: What-If deployment preview
        if: steps.azure-login.outcome == 'success'
        run: |
          ADMIN_OID=$(az ad signed-in-user show --query id -o tsv 2>/dev/null || az account show --query user.name -o tsv)
          az deployment group what-if \
            --resource-group "rg-${{ env.WORKLOAD }}" \
            --template-file workshops/appservice/infra/bicep/main.bicep \
            --parameters workshops/appservice/infra/bicep/main.bicepparam \
              location="${{ env.LOCATION }}" \
              workloadName="${{ env.WORKLOAD }}" \
              sqlAadAdminObjectId="$ADMIN_OID"

      - name: Skip notice
        if: steps.azure-login.outcome != 'success'
        run: |
          echo "::notice::Azure credentials not configured — skipped what-if preview. Bicep syntax validation passed."
```

- [ ] **Step 2: Create `deploy-appservice-infra.yml`**

```yaml
# Deploys App Service Bicep infrastructure to Azure.
# Manual dispatch only — participants choose their region and workload name.
# Push-based validation is handled by validate-appservice-infra.yml.
name: Deploy App Service Infrastructure

on:
  workflow_dispatch:
    inputs:
      location:
        description: 'Azure region'
        type: choice
        options:
          - eastus2
          - swedencentral
          - australiaeast
        default: eastus2
      workloadName:
        description: 'Workload name (used in resource naming)'
        type: string
        default: srelab

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      LOCATION: ${{ inputs.location || vars.AZURE_LOCATION || 'eastus2' }}
      WORKLOAD: ${{ inputs.workloadName || vars.WORKLOAD_NAME || 'srelab' }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Resolve deploying principal object ID
        id: principal
        run: |
          # The AZURE_CREDENTIALS service principal becomes the SQL AAD admin.
          CLIENT_ID=$(echo '${{ secrets.AZURE_CREDENTIALS }}' | jq -r '.clientId')
          ADMIN_OID=$(az ad sp show --id "$CLIENT_ID" --query id -o tsv)
          echo "admin_oid=$ADMIN_OID" >> "$GITHUB_OUTPUT"

      - name: Create resource group
        run: |
          az group create \
            --name "rg-${{ env.WORKLOAD }}" \
            --location "${{ env.LOCATION }}" \
            --tags workshop=sre-agent environment=demo

      - name: Deploy Bicep template
        id: deploy
        run: |
          az deployment group create \
            --resource-group "rg-${{ env.WORKLOAD }}" \
            --template-file workshops/appservice/infra/bicep/main.bicep \
            --parameters workshops/appservice/infra/bicep/main.bicepparam \
              location="${{ env.LOCATION }}" \
              workloadName="${{ env.WORKLOAD }}" \
              sqlAadAdminObjectId="${{ steps.principal.outputs.admin_oid }}" \
            --query 'properties.outputs' \
            -o json > deployment-outputs.json

          cat deployment-outputs.json

          echo "web_app=$(jq -r '.webAppName.value' deployment-outputs.json)" >> "$GITHUB_OUTPUT"
          echo "web_host=$(jq -r '.webAppHostName.value' deployment-outputs.json)" >> "$GITHUB_OUTPUT"
          echo "sql_server=$(jq -r '.sqlServerName.value' deployment-outputs.json)" >> "$GITHUB_OUTPUT"

      - name: Print deployment summary
        run: |
          echo "============================================"
          echo "  Infrastructure Deployment Complete"
          echo "============================================"
          echo "Resource Group:  rg-${{ env.WORKLOAD }}"
          echo "Location:        ${{ env.LOCATION }}"
          echo "Web App:         ${{ steps.deploy.outputs.web_app }}"
          echo "Web App URL:     https://${{ steps.deploy.outputs.web_host }}"
          echo "SQL Server:      ${{ steps.deploy.outputs.sql_server }}"
          echo "============================================"
          echo ""
          echo "Next: Run the 'Deploy App Service Application' workflow."
```

- [ ] **Step 3: Create `deploy-appservice-app.yml`**

```yaml
# Builds and deploys the .NET 10 shop to App Service, then runs the DB
# schema + managed-identity grant via sqlcmd (AAD auth as the SQL admin SP).
name: Deploy App Service Application

on:
  push:
    branches: [main]
    paths:
      - 'workshops/appservice/src/**'
      - 'workshops/appservice/db/**'
  workflow_dispatch:
    inputs:
      workloadName:
        description: 'Workload name (must match the infra deployment)'
        type: string
        default: srelab

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      WORKLOAD: ${{ inputs.workloadName || vars.WORKLOAD_NAME || 'srelab' }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup .NET 10
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Publish app
        run: |
          dotnet publish workshops/appservice/src/Shop.csproj -c Release -o ./publish
          cd publish && zip -r ../app.zip . && cd ..

      - name: Azure Login
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Resolve resource names
        id: names
        run: |
          WEB_APP=$(az webapp list -g "rg-${{ env.WORKLOAD }}" --query "[0].name" -o tsv)
          SQL_FQDN=$(az sql server list -g "rg-${{ env.WORKLOAD }}" --query "[0].fullyQualifiedDomainName" -o tsv)
          UAMI_CLIENT_ID=$(az identity show --name "${{ env.WORKLOAD }}-id" -g "rg-${{ env.WORKLOAD }}" --query clientId -o tsv)
          echo "web_app=$WEB_APP" >> "$GITHUB_OUTPUT"
          echo "sql_fqdn=$SQL_FQDN" >> "$GITHUB_OUTPUT"
          echo "uami_client_id=$UAMI_CLIENT_ID" >> "$GITHUB_OUTPUT"

      - name: Deploy zip to App Service
        run: |
          az webapp deploy \
            --resource-group "rg-${{ env.WORKLOAD }}" \
            --name "${{ steps.names.outputs.web_app }}" \
            --src-path app.zip \
            --type zip

      - name: Install sqlcmd (go-sqlcmd)
        run: |
          curl -fsSL -o sqlcmd.tar.bz2 \
            https://github.com/microsoft/go-sqlcmd/releases/download/v1.8.0/sqlcmd-linux-amd64.tar.bz2
          tar xjf sqlcmd.tar.bz2
          sudo mv sqlcmd /usr/local/bin/sqlcmd
          sqlcmd --version

      - name: Apply DB schema and grant managed identity
        env:
          SQL_FQDN: ${{ steps.names.outputs.sql_fqdn }}
          UAMI_CLIENT_ID: ${{ steps.names.outputs.uami_client_id }}
        run: |
          # Compute the SQL SID (little-endian client-id bytes) for the contained user.
          UAMI_SID="0x$(python3 -c "import uuid;print(uuid.UUID('${UAMI_CLIENT_ID}').bytes_le.hex())")"

          # AAD auth as the logged-in SP (the SQL admin) via ActiveDirectoryDefault.
          sqlcmd --authentication-method ActiveDirectoryDefault \
            -S "${SQL_FQDN}" -d "${{ env.WORKLOAD }}-db" \
            -i workshops/appservice/db/schema.sql

          sqlcmd --authentication-method ActiveDirectoryDefault \
            -S "${SQL_FQDN}" -d "${{ env.WORKLOAD }}-db" \
            -v uamiName="${{ env.WORKLOAD }}-id" uamiSid="${UAMI_SID}" \
            -i workshops/appservice/db/grant.sql

      - name: Print app URL
        run: |
          HOST=$(az webapp show -g "rg-${{ env.WORKLOAD }}" -n "${{ steps.names.outputs.web_app }}" --query defaultHostName -o tsv)
          echo "============================================"
          echo "  Application Deployment Complete"
          echo "============================================"
          echo "App URL:   https://${HOST}"
          echo "Health:    https://${HOST}/health"
          echo "Products:  https://${HOST}/products"
          echo "============================================"
```

- [ ] **Step 4: Verify all three workflows are valid YAML**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
for f in validate-appservice-infra deploy-appservice-infra deploy-appservice-app; do
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/$f.yml')); print('$f OK')"
done
```
Expected: `validate-appservice-infra OK`, `deploy-appservice-infra OK`, `deploy-appservice-app OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/validate-appservice-infra.yml .github/workflows/deploy-appservice-infra.yml .github/workflows/deploy-appservice-app.yml
git commit -m "feat(appservice): add validate and deploy workflows

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Knowledge file + track README + root README entry

**Files:**
- Create: `workshops/appservice/knowledge/operational-guidelines.md`
- Create: `workshops/appservice/README.md`
- Modify: `README.md` (root — add the App Service track to the track overview)

- [ ] **Step 1: Create `workshops/appservice/knowledge/operational-guidelines.md`**

```markdown
# Operational Guidelines

## Infrastructure as Code — No Direct Changes

All infrastructure changes MUST go through code. Never modify Azure resources directly via CLI, portal, or API during incident remediation.

**When you identify a fix:**

1. **Create a GitHub issue** describing the root cause, affected resources, and the required Bicep change
2. **Assign the issue to `@copilot`** (the Copilot coding agent) — it will pick up the issue, create a branch, make the fix, and open a PR automatically
3. After the PR is merged, an operator manually triggers the **Deploy App Service Infrastructure** workflow to apply the change (deployment is intentionally manual via `workflow_dispatch`, not automatic on merge)

**Do NOT:**
- Run `az` CLI commands to directly create, modify, or delete Azure resources
- Use the Azure portal to make manual changes
- Apply temporary fixes outside of version control
- Create branches or PRs yourself — delegate to `@copilot` via GitHub issues

**Why:** This team follows GitOps principles. All infrastructure state is defined in Bicep templates under `workshops/appservice/infra/bicep/`. Direct changes create drift between code and reality, making future incidents harder to diagnose. Using GitHub issues with `@copilot` ensures full traceability from incident → issue → PR → deployment.

## Architecture Overview

- **App Service** (`srelab-web-{suffix}`): Linux B1 plan hosting the .NET 10 shop; endpoints `/`, `/health`, `/products`
- **Azure SQL Database** (`srelab-sql-{suffix}` / `srelab-db`): catalog store, accessed passwordlessly via managed identity (no connection-string secrets)
- **Managed Identity** (`srelab-id`): UAMI assigned to the web app; granted a least-privilege contained user (`db_datareader`) in Azure SQL
- **Authentication chain**: Web App → User-Assigned Managed Identity → AAD token → Azure SQL contained user (`db_datareader`)

## Telemetry

- **Application Insights** (`srelab-ai`, workspace-based) collects requests, dependencies, and exceptions
- **Log Analytics** (`srelab-law`) also receives App Service platform logs (`AppServiceConsoleLogs`, `AppServiceHTTPLogs`) via diagnostic settings
- The shop logs failures to stdout (`AppServiceConsoleLogs`) and they surface as `AppExceptions` in App Insights
```

- [ ] **Step 2: Create `workshops/appservice/README.md`**

```markdown
# App Service / PaaS SRE Workshop

Deploy Azure App Service (Linux) + Azure SQL, run a .NET 10 shop with passwordless
managed-identity auth, then break and recover it with the Azure SRE Agent.

## Workshop modules

- [00. Prerequisites](./docs/00-prerequisites.md)
- [01. Deploy Infrastructure](./docs/01-deploy-infrastructure.md)
- [02. Deploy Application](./docs/02-deploy-application.md)
- [03. Onboard SRE Agent](./docs/03-onboard-sre-agent.md)
- [04. Configure Incident Response](./docs/04-configure-incident-response.md)
- [90. Watch SRE Agent](./docs/90-watch-sre-agent.md)
- [99. Cleanup](./docs/99-cleanup.md)

## Scenarios

<!-- BEGIN SCENARIOS -->
<!-- END SCENARIOS -->

## Cost

| Resource | ~Cost/hr | Notes |
| --- | --- | --- |
| App Service Plan (B1 Linux) | ~$0.018 | Always On enabled |
| Azure SQL Database (Basic) | ~$0.007 | 5 DTU, minimal |
| Log Analytics + App Insights | ~$0.10 | Standard monitoring |
| SRE Agent | ~$0.50 | Depends on model/volume |

Remember to run the **Cleanup** module (99) when done — idle resources still bill.
```

> Note: the `<!-- BEGIN SCENARIOS -->` / `<!-- END SCENARIOS -->` markers are intentionally adjacent (empty) — the generator fills the table once the track has a scenario. The validator leaves this track untouched until then.

- [ ] **Step 3: Add the App Service track to the root `README.md`**

The root README's `## Choose a track` section is a 3-column table. Add a third row directly below the VM row (line ~22). Change:
```markdown
| **AKS / Cloud-Native** | Kubernetes workload identity, CosmosDB RBAC fault injection | [workshops/aks/](workshops/aks/README.md) |
| **VM / Enterprise Migration** | Windows Server + IIS, Bastion access, approval-gated remediation | [workshops/vm/](workshops/vm/README.md) |
```
to:
```markdown
| **AKS / Cloud-Native** | Kubernetes workload identity, CosmosDB RBAC fault injection | [workshops/aks/](workshops/aks/README.md) |
| **VM / Enterprise Migration** | Windows Server + IIS, Bastion access, approval-gated remediation | [workshops/vm/](workshops/vm/README.md) |
| **App Service / PaaS** | .NET 10 shop on App Service (Linux) + Azure SQL, passwordless managed identity | [workshops/appservice/](workshops/appservice/README.md) |
```

Do **NOT**:
- Add an entry to the `## Scenarios at a glance` list — that list links to per-track `scenarios/INDEX.md`, which does NOT exist for this zero-scenario track (the generator only creates it once a scenario lands). Adding one now would be a broken link. The first appservice scenario cycle adds it.
- Touch the `## 💰 Cost Estimate` table (its track-agnostic redo is tracked in issue #7).

- [ ] **Step 4: Verify validation stays green with no drift**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
scripts/validate-scenarios.sh && scripts/validate-scenarios.sh --write && git status --porcelain
```
Expected: `Scenario validation passed`; `git status --porcelain` lists ONLY your new/modified files (the three in this task) — no unexpected generated-artifact drift.

- [ ] **Step 5: Commit**

```bash
git add workshops/appservice/knowledge/operational-guidelines.md workshops/appservice/README.md README.md
git commit -m "docs(appservice): add operational guidelines, track README, root track entry

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Attendee documentation (7 module pages)

Create the 7 module docs under `workshops/appservice/docs/` by adapting the corresponding AKS docs (`workshops/aks/docs/<same-name>.md`). For each file: copy the AKS version, then apply the substitutions below. Keep the document structure, tone, headings, and any "Next Step" links (which are relative and identical across tracks).

**Global substitutions (apply to every file):**
- "AKS / Cloud-Native" → "App Service / PaaS"; "AKS cluster"/"the cluster" → "the App Service"; "Kubernetes"/"K8s" → "App Service"
- `kubectl ...` commands → the `az webapp` / browser equivalent (see per-file notes)
- "CosmosDB" → "Azure SQL"; `/items` → `/products`; "Node.js" → ".NET 10"
- `workshops/aks/` paths → `workshops/appservice/`
- Workflow names: "Deploy AKS Infrastructure" → "Deploy App Service Infrastructure"; "Deploy AKS Application" → "Deploy App Service Application"
- Resource names: `srelab-aks` → `srelab-web-{suffix}`; `srelab-cosmos-{suffix}` → `srelab-sql-{suffix}` / `srelab-db`

**Files & per-file notes:**
- Create: `workshops/appservice/docs/00-prerequisites.md` — from AKS 00. Replace any `kubectl` prerequisite with ".NET 10 SDK" and keep `az`, `git`, a GitHub account, an Azure subscription. Remove AKS-specific tooling notes.
- Create: `workshops/appservice/docs/01-deploy-infrastructure.md` — from AKS 01. The deploy flow is the **Deploy App Service Infrastructure** workflow (manual `workflow_dispatch`, region + workloadName inputs). It provisions Log Analytics + App Insights, the UAMI, Azure SQL (server + `srelab-db` + firewall), and the App Service plan + web app. Remove AKS/CosmosDB specifics. Note the SQL AAD admin is set to the deploying service principal automatically.
- Create: `workshops/appservice/docs/02-deploy-application.md` — from AKS 02. Replace the `kubectl apply` flow with: the **Deploy App Service Application** workflow builds the .NET 10 app (`dotnet publish`), zip-deploys it (`az webapp deploy --type zip`), then runs `db/schema.sql` (seed catalog) and `db/grant.sql` (grant the UAMI `db_datareader`) via `sqlcmd`. Verify with `https://<web-host>/health` (200) and `https://<web-host>/products` (catalog JSON).
- Create: `workshops/appservice/docs/03-onboard-sre-agent.md` — from AKS 03. Replace the knowledge-file path reference with `workshops/appservice/knowledge/operational-guidelines.md`; otherwise the SRE Agent onboarding steps are track-agnostic.
- Create: `workshops/appservice/docs/04-configure-incident-response.md` — from AKS 04. Keep the GitOps/@copilot incident-response configuration; update any `workshops/aks/...` paths to `workshops/appservice/...`.
- Create: `workshops/appservice/docs/90-watch-sre-agent.md` — from AKS 90. Track-agnostic narrative; apply the global substitutions only (e.g. `/items` → `/products`).
- Create: `workshops/appservice/docs/99-cleanup.md` — from AKS 99. Replace the cleanup command target with `az group delete --name rg-srelab --yes --no-wait` (same RG convention) and drop AKS/CosmosDB-specific notes; the resource-group delete removes App Service + SQL together.

- [ ] **Step 1: Create all 7 docs per the notes above**

After writing, sanity-check there are no leftover AKS-only references:
```bash
cd "$(git rev-parse --show-toplevel)"
! grep -rniE "kubectl|cosmos|\.k8s|kubernetes|/items\b" workshops/appservice/docs/ && echo "no AKS leftovers"
```
Expected: `no AKS leftovers`. (If it prints matches, fix those files. The `\b` after items avoids matching unrelated words.)

- [ ] **Step 2: Verify intra-doc relative links resolve**

Run:
```bash
cd "$(git rev-parse --show-toplevel)/workshops/appservice"
for f in docs/*.md; do
  grep -oE '\]\(\.\/[0-9A-Za-z._-]+\.md\)' "$f" | sed -E 's/\]\(\.\///;s/\)//' | while read -r link; do
    test -f "docs/$link" || echo "BROKEN: $f -> $link"
  done
done
echo "link check done"
```
Expected: `link check done` with no `BROKEN:` lines.

- [ ] **Step 3: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add workshops/appservice/docs/
git commit -m "docs(appservice): add attendee walkthrough module pages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Full acceptance gate + finish

Run the complete offline acceptance gate from the spec, then hand off for branch finishing.

- [ ] **Step 1: Bicep builds**

Run: `cd "$(git rev-parse --show-toplevel)" && az bicep build --file workshops/appservice/infra/bicep/main.bicep --stdout > /dev/null && echo "BICEP OK"`
Expected: `BICEP OK` (no `ERROR` lines).

- [ ] **Step 2: App publishes**

Run: `cd "$(git rev-parse --show-toplevel)/workshops/appservice/src" && dotnet publish -c Release -o /tmp/shop-publish2 > /dev/null && echo "PUBLISH OK"`
Expected: `PUBLISH OK`.

- [ ] **Step 3: Scenario validation green + no drift**

Run:
```bash
cd "$(git rev-parse --show-toplevel)"
scripts/validate-scenarios.sh
scripts/validate-scenarios.sh --write
git status --porcelain
```
Expected: `Scenario validation passed`; `git status --porcelain` is EMPTY (everything committed, no drift).

- [ ] **Step 4: Scenario tooling tests**

Run: `cd "$(git rev-parse --show-toplevel)/scripts/scenario-tools" && npm test 2>&1 | grep -E "tests|pass|fail"`
Expected: `tests 13`, `pass 13`, `fail 0`.

- [ ] **Step 5: Finish the branch**

All four gate checks green. Use the `superpowers:finishing-a-development-branch` skill to choose merge / PR / keep. If pushing/opening a PR, confirm with the user first.

---

## Self-Review (controller — completed during planning)

**Spec coverage** (every spec section maps to a task):
- Key decisions table → Tasks 1–8 collectively (SQL=T3, passwordless UAMI=T2/T4/T7, .NET10 zip-deploy=T6/T8, B1=T4, contained-user grant=T7/T8, GitOps=T9 knowledge).
- Architecture / resource topology → Tasks 2–5 (modules + main).
- The .NET 10 shop app → Task 6.
- Passwordless SQL access (grant chain) → Task 7 (scripts) + Task 8 (workflow sqlcmd + SID computation).
- Monitoring & alert seam → Task 2 (monitoring), Task 4 (diagnostics), Task 5 (seam comment).
- Framework registration → Task 1.
- CI/CD workflows → Task 8.
- Docs, knowledge & READMEs → Tasks 9–10.
- Deliverable file tree → produced across Tasks 1–10.
- Cost → Task 9 (track README).
- Testing & acceptance → Task 11.
- Out of scope (scenario, slots, root cost redo, VNet, Key Vault) → respected; no task adds them.

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N". Docs (Task 10) use concrete per-file substitution lists against named AKS source files (DRY, not placeholders).

**Type/name consistency:** module outputs match consumers — `monitoring.outputs.{logAnalyticsId,appInsightsConnectionString}`, `identity.outputs.{uamiId,uamiClientId,uamiPrincipalId}`, `sql.outputs.{sqlServerName,sqlServerFqdn,sqlDatabaseName}`, `appservice.outputs.{webAppName,webAppHostName}` all line up with `main.bicep` (Task 5) and the workflows (Task 8). `AZURE_SQL_CONNECTIONSTRING` is set in `appservice.bicep` (T4) and read in `Program.cs` (T6). `$(uamiName)`/`$(uamiSid)` in `grant.sql` (T7) match the `-v uamiName=… uamiSid=…` passed in the deploy workflow (T8). The web app name pattern `${workloadName}-web-${uniqueSuffix}` is resolved dynamically via `az webapp list` in T8 (not hard-coded).
