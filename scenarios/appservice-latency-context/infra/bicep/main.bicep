targetScope = 'resourceGroup'

param location string = resourceGroup().location
@description('Run ownership token persisted by setup; never share a resource group between workshop runs.')
param owner string
param groupTags object = {}
@allowed(['PHP|8.3'])
param runtime string = 'PHP|8.3'

var suffix = uniqueString(resourceGroup().id)
var prefix = 'alctx-${suffix}'
var tags = union(groupTags, {
  scenario: 'appservice-latency-context'
  owner: owner
})

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-insights'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-plan'
  location: location
  kind: 'linux'
  tags: tags
  sku: { name: 'B1', tier: 'Basic', capacity: 1 }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: prefix
  location: location
  kind: 'app,linux'
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: runtime
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appCommandLine: 'cp /home/site/wwwroot/nginx.conf /etc/nginx/sites-available/default && service nginx reload'
    }
  }
}

resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: app
  name: 'appsettings'
  properties: union(list('${app.id}/config/appsettings', '2023-12-01').properties, {
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  })
}

resource diagnostic 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'alctx-evidence'
  scope: app
  properties: {
    workspaceId: workspace.id
    logAnalyticsDestinationType: 'Dedicated'
    logs: [
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServicePlatformLogs', enabled: true }
    ]
  }
}

output appName string = app.name
output url string = 'https://${app.properties.defaultHostName}'
output workspaceId string = workspace.properties.customerId
output workspaceResourceId string = workspace.id
output insightsResourceId string = insights.id
output appResourceId string = app.id
