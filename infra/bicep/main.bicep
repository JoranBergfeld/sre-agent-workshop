// ──────────────────────────────────────────────────────────────
// Azure SRE Agent Workshop — Main Orchestrator
// Composes: Monitoring → AKS → CosmosDB → Identity → Alerts
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for all resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelab'

@description('Resource tags applied to every resource')
param tags object = {
  workshop: 'sre-agent'
  environment: 'demo'
}

// Deterministic 4-char suffix for globally unique resource names (e.g., CosmosDB)
var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 4)

// ──────────────────────────────────────────────
// 1. Monitoring (Log Analytics + App Insights)
//    Deployed first — AKS needs the workspace ID
// ──────────────────────────────────────────────
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 2. AKS Cluster (depends on Log Analytics)
// ──────────────────────────────────────────────
module aks 'modules/aks.bicep' = {
  name: 'aks'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsId
  }
}

// ──────────────────────────────────────────────
// 3. CosmosDB (NoSQL API — Serverless, independent)
// ──────────────────────────────────────────────
module cosmos 'modules/cosmosdb.bicep' = {
  name: 'cosmos'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    uniqueSuffix: uniqueSuffix
  }
}

// ──────────────────────────────────────────────
// 4. Identity (UAMI + Federated Cred + CosmosDB role)
//    Depends on AKS (OIDC issuer) and CosmosDB (role scope)
// ──────────────────────────────────────────────
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    aksOidcIssuerUrl: aks.outputs.oidcIssuerUrl
    cosmosDbAccountName: cosmos.outputs.accountName
  }
}

// ──────────────────────────────────────────────
// 5. Alert: Container restart count > 3 in 5 min
//    Deployed after AKS so it can scope to the cluster
// ──────────────────────────────────────────────
resource restartAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-container-restarts'
  location: location
  tags: tags
  properties: {
    displayName: 'Container Restart Count > 3'
    description: 'Fires when any container in the AKS cluster restarts more than 3 times within 5 minutes.'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    scopes: [
      aks.outputs.clusterId
    ]
    criteria: {
      allOf: [
        {
          query: '''
            KubePodInventory
            | where ContainerRestartCount > 3
            | summarize RestartCount = max(ContainerRestartCount) by Name, Namespace, bin(TimeGenerated, 5m)
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

// ──────────────────────────────────────────────
// 6. Alert: HTTP 500 errors in container logs
//    Fires when the app returns repeated 5xx errors
//    (e.g., CosmosDB auth failure after RBAC break)
// ──────────────────────────────────────────────
resource http500Alert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${workloadName}-http-500-errors'
  location: location
  tags: tags
  properties: {
    displayName: 'HTTP 500 Errors Detected'
    description: 'Fires when the workshop app logs error responses in container logs — typically caused by CosmosDB connectivity or RBAC failures.'
    severity: 3
    enabled: true
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    scopes: [
      aks.outputs.clusterId
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

// ── Outputs ──────────────────────────────────
@description('AKS cluster name')
output aksClusterName string = aks.outputs.clusterName

@description('AKS cluster resource ID')
output aksClusterId string = aks.outputs.clusterId

@description('CosmosDB endpoint')
output cosmosDbEndpoint string = cosmos.outputs.endpoint

@description('User-Assigned Managed Identity client ID')
output uamiClientId string = identity.outputs.uamiClientId

@description('Log Analytics workspace ID')
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId

@description('Application Insights connection string')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
