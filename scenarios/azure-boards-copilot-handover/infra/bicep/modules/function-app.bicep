param location string
param workloadName string
param functionAppName string
param storageAccountName string
@secure()
param appInsightsConnectionString string
param serviceBusFullyQualifiedNamespace string
param queueName string
param tableServiceEndpoint string
param receiptTableName string
param scenarioStateTableName string
param tags object

resource hostStorage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource packageBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: hostStorage
  name: 'default'
}

resource applicationPackages 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: packageBlobService
  name: 'application-packages'
}

var hostStorageKey = hostStorage.listKeys().keys[0].value
var hostStorageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${hostStorage.name};AccountKey=${hostStorageKey};EndpointSuffix=${environment().suffixes.storage}'

resource consumptionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${workloadName}-plan'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: consumptionPlan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      alwaysOn: false
      ftpsState: 'Disabled'
      functionAppScaleLimit: 1
      linuxFxVersion: 'Python|3.12'
      minTlsVersion: '1.2'
    }
  }
}

// Query only after site creation, and keep deploy-owned package/SHA/cutover settings.
// No current settings (including host keys) are emitted as deployment outputs.
resource appSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: union(list('${functionApp.id}/config/appsettings', '2023-12-01').properties, {
    WORKSHOP_PACKAGE_STORAGE_ACCOUNT: storageAccountName
    WORKSHOP_PACKAGE_CONTAINER: applicationPackages.name
    AzureWebJobsStorage: hostStorageConnectionString
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'python'
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing'
    WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT: '1'
    AzureFunctionsJobHost__extensions__serviceBus__prefetchCount: '0'
    AzureFunctionsJobHost__extensions__serviceBus__maxConcurrentCalls: '1'
    ServiceBusConnection__fullyQualifiedNamespace: serviceBusFullyQualifiedNamespace
    ORDER_EVENTS_QUEUE_NAME: queueName
    TABLE_SERVICE_ENDPOINT: tableServiceEndpoint
    NORMALIZED_RECEIPTS_TABLE_NAME: receiptTableName
    SCENARIO_STATE_TABLE_NAME: scenarioStateTableName
    UNSUPPORTED_EVENT_RETRY_DELAY_SECONDS: '5'
    UNSUPPORTED_EVENT_RETRY_MAX_DELAY_SECONDS: '30'
  })
}

resource packageReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(applicationPackages.id, functionApp.id, 'package-reader')
  scope: applicationPackages
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
