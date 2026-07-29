@description('Azure region for alert resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (Log Analytics workspace)')
param scopeResourceId string

resource diskPressureAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-vm-disk-pressure'
  location: location
  tags: tags
  properties: {
    displayName: 'VM Disk Free Space Critical'
    description: 'Alerts when C: free space drops below 10 percent on workshop VMs.'
    severity: 2
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
            | where ObjectName == "LogicalDisk" and CounterName == "% Free Space" and InstanceName == "C:"
            | summarize FreeSpace=min(CounterValue) by Computer, bin(TimeGenerated, 5m)
          '''
          metricMeasureColumn: 'FreeSpace'
          timeAggregation: 'Average'
          operator: 'LessThan'
          threshold: 10
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
