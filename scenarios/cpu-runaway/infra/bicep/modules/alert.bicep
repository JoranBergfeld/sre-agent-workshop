@description('Azure region for alert resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (Log Analytics workspace)')
param scopeResourceId string

resource cpuRunawayAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-vm-cpu-runaway'
  location: location
  tags: tags
  properties: {
    displayName: 'VM CPU Runaway'
    description: 'Alerts when CPU exceeds 85 percent on scenario VMs.'
    severity: 3
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      scopeResourceId
    ]
    criteria: {
      allOf: [
        {
          query: '''
            Perf
            | where ObjectName == "Processor" and CounterName == "% Processor Time" and InstanceName == "_Total"
            | summarize AvgCpu=avg(CounterValue) by Computer, bin(TimeGenerated, 5m)
          '''
          metricMeasureColumn: 'AvgCpu'
          timeAggregation: 'Average'
          operator: 'GreaterThan'
          threshold: 85
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
