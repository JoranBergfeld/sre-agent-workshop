param principalId string
param serviceBusNamespaceName string
param queueName string
param storageAccountName string

var azureServiceBusDataReceiverRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0'
)
var storageTableDataContributorRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
)

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2024-01-01' existing = {
  name: serviceBusNamespaceName
}

resource orderEventsQueue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' existing = {
  parent: serviceBusNamespace
  name: queueName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource serviceBusDataReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(orderEventsQueue.id, principalId, azureServiceBusDataReceiverRoleId)
  scope: orderEventsQueue
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: azureServiceBusDataReceiverRoleId
  }
}

resource storageTableDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: storageTableDataContributorRoleId
  }
}
