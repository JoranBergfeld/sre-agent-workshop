@description('Azure region for CosmosDB')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Unique suffix for globally unique CosmosDB account name')
param uniqueSuffix string

// ──────────────────────────────────────────────
// CosmosDB Account — NoSQL (Core) API, Serverless
// ──────────────────────────────────────────────
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-02-15-preview' = {
  name: '${workloadName}-cosmos-${uniqueSuffix}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

// ──────────────────────────────────────────────
// SQL Database
// ──────────────────────────────────────────────
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-02-15-preview' = {
  parent: cosmosAccount
  name: 'workshop'
  properties: {
    resource: {
      id: 'workshop'
    }
  }
}

// ──────────────────────────────────────────────
// SQL Container
// ──────────────────────────────────────────────
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-02-15-preview' = {
  parent: database
  name: 'items'
  properties: {
    resource: {
      id: 'items'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}

// ── Outputs ──────────────────────────────────
@description('CosmosDB account name')
output accountName string = cosmosAccount.name

@description('CosmosDB account resource ID')
output accountId string = cosmosAccount.id

@description('CosmosDB endpoint')
output endpoint string = cosmosAccount.properties.documentEndpoint

// Connection string available via: az cosmosdb keys list --type connection-strings
