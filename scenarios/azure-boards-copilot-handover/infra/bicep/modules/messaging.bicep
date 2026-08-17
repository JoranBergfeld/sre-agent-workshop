param location string
param namespaceName string
param queueName string
param tags object

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource orderEventsQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBusNamespace
  name: queueName
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    enableBatchedOperations: true
    enablePartitioning: false
    lockDuration: 'PT1M'
    maxDeliveryCount: 100
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
  }
}

output namespaceName string = serviceBusNamespace.name
output namespaceId string = serviceBusNamespace.id
output fullyQualifiedNamespace string = '${serviceBusNamespace.name}.servicebus.windows.net'
output queueName string = orderEventsQueue.name
output queueId string = orderEventsQueue.id
