@description('Azure region for alert resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Resource ID this alert is scoped to (AKS cluster)')
param scopeResourceId string

resource authErrorsAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-workload-identity-auth-errors'
  location: location
  tags: tags
  properties: {
    displayName: 'Workload Identity Auth Errors'
    description: 'Fires when the workshop app logs Azure AD token-exchange failures in container logs — typically a missing or misconfigured federated identity credential (authentication failure).'
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
            | where LogEntry has "AADSTS70021" or LogEntry has "No matching federated identity" or LogEntry has "ManagedIdentityCredential" or LogEntry contains "AADSTS"
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
