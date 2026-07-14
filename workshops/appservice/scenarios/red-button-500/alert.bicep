@description('Azure region for the alert')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (cluster or Log Analytics workspace)')
param scopeResourceId string

resource alert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-red-button-500-alert'
  location: location
  tags: tags
  properties: {
    severity: 3
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [scopeResourceId]
    criteria: {
      allOf: [
        {
          query: 'AzureDiagnostics | where TimeGenerated > ago(5m) | count'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
        }
      ]
    }
    autoMitigate: false
  }
}
