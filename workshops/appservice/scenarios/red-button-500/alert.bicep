@description('Azure region for the alert')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (Log Analytics workspace)')
param scopeResourceId string

resource redButton5xxAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-redbutton-5xx'
  location: location
  tags: tags
  properties: {
    displayName: 'Red button 5xx on /api/red'
    description: 'Fires when /api/red requests fail (5xx) — the broken red-button feature in the red-button-500 scenario.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [scopeResourceId]
    criteria: {
      allOf: [
        {
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Url contains "/api/red"
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
