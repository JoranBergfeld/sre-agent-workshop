@description('Azure region for monitoring resources')
param location string

@description('Base workload name for resource naming')
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
// Application Insights (connected to Log Analytics)
// ──────────────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${workloadName}-ai'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ──────────────────────────────────────────────
// Azure Monitor Agent event collection for the IIS app-pool alert.
// The associated VM resources are declared in the VM module.
// ──────────────────────────────────────────────
resource iisEventCollectionRule 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: '${workloadName}-iis-events-dcr'
  location: location
  tags: tags
  properties: {
    dataSources: {
      windowsEventLogs: [
        {
          name: 'iisSystemEvents'
          streams: [
            'Microsoft-Event'
          ]
          xPathQueries: [
            'System!*'
          ]
        }
      ]
    }
    destinations: {
      logAnalytics: [
        {
          name: 'logAnalytics'
          workspaceResourceId: logAnalytics.id
        }
      ]
    }
    dataFlows: [
      {
        streams: [
          'Microsoft-Event'
        ]
        destinations: [
          'logAnalytics'
        ]
      }
    ]
  }
}

// ── Outputs ──────────────────────────────────
@description('Log Analytics workspace resource ID')
output logAnalyticsId string = logAnalytics.id

@description('Log Analytics workspace ID (GUID)')
output logAnalyticsWorkspaceId string = logAnalytics.properties.customerId

@description('Application Insights connection string')
output appInsightsConnectionString string = appInsights.properties.ConnectionString

@description('Data Collection Rule resource ID for IIS System event telemetry')
output dataCollectionRuleId string = iisEventCollectionRule.id
