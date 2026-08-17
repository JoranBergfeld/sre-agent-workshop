param location string
param storageAccountName string
param receiptTableName string
param scenarioStateTableName string
param tags object

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource normalizedReceiptsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: receiptTableName
}

resource scenarioStateTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tableService
  name: scenarioStateTableName
}

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output tableServiceEndpoint string = storageAccount.properties.primaryEndpoints.table
output receiptTableName string = normalizedReceiptsTable.name
output scenarioStateTableName string = scenarioStateTable.name
