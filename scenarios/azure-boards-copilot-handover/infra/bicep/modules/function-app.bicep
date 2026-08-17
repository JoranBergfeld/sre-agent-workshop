param location string
param workloadName string
param functionAppName string
param storageAccountName string
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
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: hostStorageConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'AzureWebJobsFeatureFlags'
          value: 'EnableWorkerIndexing'
        }
        {
          name: 'WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT'
          value: '1'
        }
        {
          name: 'AzureFunctionsJobHost__extensions__serviceBus__prefetchCount'
          value: '0'
        }
        {
          name: 'AzureFunctionsJobHost__extensions__serviceBus__maxConcurrentCalls'
          value: '1'
        }
        {
          name: 'ServiceBusConnection__fullyQualifiedNamespace'
          value: serviceBusFullyQualifiedNamespace
        }
        {
          name: 'ORDER_EVENTS_QUEUE_NAME'
          value: queueName
        }
        {
          name: 'TABLE_SERVICE_ENDPOINT'
          value: tableServiceEndpoint
        }
        {
          name: 'NORMALIZED_RECEIPTS_TABLE_NAME'
          value: receiptTableName
        }
        {
          name: 'SCENARIO_STATE_TABLE_NAME'
          value: scenarioStateTableName
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppHostName string = functionApp.properties.defaultHostName
output principalId string = functionApp.identity.principalId
