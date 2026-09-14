targetScope = 'subscription'

@description('Azure region for the scenario resource group and all resources')
param location string = 'eastus2'

@description('Distinct base name: 6-24 lowercase letters, numbers, or hyphens; starts with a letter and ends with a letter or number')
@minLength(6)
@maxLength(24)
param workloadName string = 'srelabboardshandover'

var invalidWorkloadNameCharacters = filter(range(0, length(workloadName)), index => !contains('abcdefghijklmnopqrstuvwxyz0123456789-', substring(workloadName, index, 1)))
var workloadNameIsAzureSafe = empty(invalidWorkloadNameCharacters) && contains('abcdefghijklmnopqrstuvwxyz', substring(workloadName, 0, 1)) && contains('abcdefghijklmnopqrstuvwxyz0123456789', substring(workloadName, length(workloadName) - 1, 1))
var validatedWorkloadName = workloadNameIsAzureSafe ? workloadName : fail('workloadName must contain 6-24 lowercase letters, numbers, or hyphens, start with a letter, and end with a letter or number.')

@description('Resource tags applied to every scenario resource')
param tags object = {
  workshop: 'sre-agent'
  scenario: 'azure-boards-copilot-handover'
  environment: 'demo'
}

var resourceGroupName = '${validatedWorkloadName}-rg'
var uniqueSuffix = substring(uniqueString(subscription().subscriptionId, validatedWorkloadName), 0, 6)
var serviceBusNamespaceName = '${validatedWorkloadName}-sb-${uniqueSuffix}'
var functionAppName = '${validatedWorkloadName}-func-${uniqueSuffix}'
var storageAccountName = '${take(replace(validatedWorkloadName, '-', ''), 16)}${uniqueSuffix}st'
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
    workloadName: validatedWorkloadName
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
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    tags: tags
  }
}

module functionApp 'modules/function-app.bicep' = {
  name: 'function-app'
  scope: scenarioResourceGroup
  params: {
    location: location
    workloadName: validatedWorkloadName
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
    receiptTableName: storage.outputs.receiptTableName
    receiptTableId: storage.outputs.receiptTableId
    scenarioStateTableName: storage.outputs.scenarioStateTableName
    scenarioStateTableId: storage.outputs.scenarioStateTableId
  }
}

module activeBacklogAlert 'modules/active-backlog-alert.bicep' = {
  name: 'active-backlog-alert'
  scope: scenarioResourceGroup
  params: {
    workloadName: validatedWorkloadName
    serviceBusNamespaceId: messaging.outputs.namespaceId
    queueName: messaging.outputs.queueName
    tags: tags
  }
}

module dlqAlert 'modules/dlq-alert.bicep' = {
  name: 'dlq-safety-alert'
  scope: scenarioResourceGroup
  params: {
    workloadName: validatedWorkloadName
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
