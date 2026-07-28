@description('Azure region for alert resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (AKS cluster)')
param scopeResourceId string

resource http500Alert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-http-500-errors'
  location: location
  tags: tags
  properties: {
    displayName: 'HTTP 500 Errors Detected'
    description: 'Fires when the workshop app logs error responses in container logs — typically caused by CosmosDB connectivity or RBAC failures.'
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
            let workshopContainers = KubePodInventory
            | where Namespace == "workshop"
            | where TimeGenerated > ago(1h)
            | distinct ContainerID;
            ContainerLog
            | where ContainerID in (workshopContainers)
            | where LogEntry has "Failed to read items from CosmosDB" or LogEntry has "RBAC" or LogEntry has "StatusCode: 500" or LogEntry has "Forbidden"
            | summarize ErrorCount = count() by bin(TimeGenerated, 5m)
          '''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
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
