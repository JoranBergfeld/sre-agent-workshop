targetScope = 'resourceGroup'

@description('Azure region for all resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelabapp'

@description('GitHub repository in owner/repository format')
param githubRepository string

@description('Resource tags applied to every resource')
param tags object = {
  workshop: 'sre-agent'
  environment: 'demo'
}

var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 4)

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

module deploymentIdentity 'modules/identity.bicep' = {
  name: 'deployment-identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    githubRepository: githubRepository
  }
}

module appservice 'modules/appservice.bicep' = {
  name: 'appservice'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    uniqueSuffix: uniqueSuffix
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    logAnalyticsId: monitoring.outputs.logAnalyticsId
  }
}

module scenarioAlert 'modules/alert.bicep' = {
  name: 'cloud-agent-handover-alert'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    scopeResourceId: monitoring.outputs.logAnalyticsId
  }
}

@description('Web App name')
output webAppName string = appservice.outputs.webAppName

@description('Web App default host name')
output webAppHostName string = appservice.outputs.webAppHostName

@description('Log Analytics workspace resource ID')
output logAnalyticsId string = monitoring.outputs.logAnalyticsId

@description('GitHub Actions deployment identity client ID')
output deploymentClientId string = deploymentIdentity.outputs.clientId
