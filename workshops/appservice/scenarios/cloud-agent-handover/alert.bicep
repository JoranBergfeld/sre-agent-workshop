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
