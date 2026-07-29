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
// Azure Monitor Agent CPU collection
// ──────────────────────────────────────────────
resource cpuPerfDataCollectionRule 'Microsoft.Insights/dataCollectionRules@2023-03-11' = {
  name: '${workloadName}-cpu-perf-dcr'
  location: location
  tags: tags
  kind: 'Windows'
  properties: {
    dataSources: {
      performanceCounters: [
        {
          name: 'processorTime'
          streams: [
            'Microsoft-Perf'
          ]
          samplingFrequencyInSeconds: 60
          counterSpecifiers: [
            '\\Processor(_Total)\\% Processor Time'
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
          'Microsoft-Perf'
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

@description('CPU performance counter data collection rule resource ID')
output cpuDataCollectionRuleId string = cpuPerfDataCollectionRule.id
