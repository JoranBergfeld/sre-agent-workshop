targetScope = 'subscription'

@description('Azure region for the scenario resource group and all resources')
param location string = 'eastus2'

@description('Distinct base name used to derive scenario-owned Azure resource names')
@minLength(6)
@maxLength(24)
param workloadName string = 'srelabboardshandover'

@description('Resource tags applied to every scenario resource')
param tags object = {
  workshop: 'sre-agent'
  scenario: 'azure-boards-copilot-handover'
  environment: 'demo'
}

var resourceGroupName = '${workloadName}-rg'
var uniqueSuffix = substring(uniqueString(subscription().subscriptionId, workloadName), 0, 6)
var serviceBusNamespaceName = take(toLower('${workloadName}-sb-${uniqueSuffix}'), 50)
var functionAppName = take(toLower('${workloadName}-func-${uniqueSuffix}'), 60)
var storageAccountName = take(toLower(replace('${workloadName}${uniqueSuffix}st', '-', '')), 24)
var queueName = 'order-events'
var receiptTableName = 'NormalizedReceipts'
var scenarioStateTableName = 'ScenarioState'

resource scenarioResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: scenarioResourceGroup
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: scenarioResourceGroup
  params: {
    location: location
    storageAccountName: storageAccountName
    receiptTableName: receiptTableName
    scenarioStateTableName: scenarioStateTableName
    tags: tags
  }
}

module messaging 'modules/messaging.bicep' = {
  name: 'messaging'
  scope: scenarioResourceGroup
  params: {
    location: location
    namespaceName: serviceBusNamespaceName
    queueName: queueName
    tags: tags
  }
}

module functionApp 'modules/function-app.bicep' = {
  name: 'function-app'
  scope: scenarioResourceGroup
  params: {
    location: location
    workloadName: workloadName
    functionAppName: functionAppName
    storageAccountName: storage.outputs.storageAccountName
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    serviceBusFullyQualifiedNamespace: messaging.outputs.fullyQualifiedNamespace
    queueName: messaging.outputs.queueName
    tableServiceEndpoint: storage.outputs.tableServiceEndpoint
    receiptTableName: storage.outputs.receiptTableName
    scenarioStateTableName: storage.outputs.scenarioStateTableName
    tags: tags
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'data-plane-rbac'
  scope: scenarioResourceGroup
  params: {
    principalId: functionApp.outputs.principalId
    serviceBusNamespaceName: messaging.outputs.namespaceName
    queueName: messaging.outputs.queueName
    storageAccountName: storage.outputs.storageAccountName
  }
}

module activeBacklogAlert 'modules/active-backlog-alert.bicep' = {
  name: 'active-backlog-alert'
  scope: scenarioResourceGroup
  params: {
    workloadName: workloadName
    serviceBusNamespaceId: messaging.outputs.namespaceId
    queueName: messaging.outputs.queueName
    tags: tags
  }
}

module dlqAlert 'modules/dlq-alert.bicep' = {
  name: 'dlq-safety-alert'
  scope: scenarioResourceGroup
  params: {
    workloadName: workloadName
    serviceBusNamespaceId: messaging.outputs.namespaceId
    queueName: messaging.outputs.queueName
    tags: tags
  }
}

@description('Scenario-owned resource group name')
output resourceGroupName string = scenarioResourceGroup.name

@description('Function App name')
output functionAppName string = functionApp.outputs.functionAppName

@description('Function App default hostname')
output functionAppHostName string = functionApp.outputs.functionAppHostName

@description('Function App system-assigned managed identity principal ID')
output functionPrincipalId string = functionApp.outputs.principalId

@description('Service Bus namespace name')
output serviceBusNamespaceName string = messaging.outputs.namespaceName

@description('Service Bus namespace resource ID')
output serviceBusNamespaceId string = messaging.outputs.namespaceId

@description('Service Bus queue name')
output queueName string = messaging.outputs.queueName

@description('Storage account name used by the Function host and scenario tables')
output storageAccountName string = storage.outputs.storageAccountName

@description('Managed-identity Table service endpoint')
output tableServiceEndpoint string = storage.outputs.tableServiceEndpoint

@description('Normalized receipt table name')
output receiptTableName string = storage.outputs.receiptTableName

@description('Scenario state table name')
output scenarioStateTableName string = storage.outputs.scenarioStateTableName

@description('Log Analytics workspace name')
output logAnalyticsWorkspaceName string = monitoring.outputs.logAnalyticsWorkspaceName

@description('Log Analytics workspace resource ID')
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId

@description('Application Insights component name')
output applicationInsightsName string = monitoring.outputs.applicationInsightsName

@description('Application Insights component resource ID')
output applicationInsightsId string = monitoring.outputs.applicationInsightsId

@description('Primary active-message backlog alert name')
output activeBacklogAlertName string = activeBacklogAlert.outputs.alertName

@description('Dead-letter queue safety alert name')
output dlqAlertName string = dlqAlert.outputs.alertName
