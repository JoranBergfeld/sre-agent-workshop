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

@description('Web App name')
output webAppName string = webApp.name

@description('Web App default host name')
output webAppHostName string = webApp.properties.defaultHostName
