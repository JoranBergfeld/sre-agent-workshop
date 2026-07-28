@description('Azure region for identity resources')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('AKS OIDC issuer URL')
param aksOidcIssuerUrl string

@description('CosmosDB account name')
param cosmosDbAccountName string

@description('Kubernetes namespace for the workload')
param k8sNamespace string = 'workshop'

@description('Kubernetes ServiceAccount name for the workload')
param k8sServiceAccountName string = 'workshop-app'

// ──────────────────────────────────────────────
// User-Assigned Managed Identity
// ──────────────────────────────────────────────
resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${workloadName}-id'
  location: location
  tags: tags
}

// ──────────────────────────────────────────────
// Federated Identity Credential
// Links K8s ServiceAccount → UAMI via AKS OIDC issuer
// ──────────────────────────────────────────────
resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: uami
  name: '${workloadName}-fed-cred'
  properties: {
    issuer: aksOidcIssuerUrl
    subject: 'system:serviceaccount:${k8sNamespace}:${k8sServiceAccountName}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// ──────────────────────────────────────────────
// CosmosDB role assignment for the UAMI
// Uses the built-in "Cosmos DB Built-in Data Contributor" role
// so the app can read and write documents.
//
// NOTE: Uses inline resource ID construction instead of an `existing`
// reference to avoid ARM deployment caching issues where the role
// assignment could be silently skipped on re-deployment.
// ──────────────────────────────────────────────
var cosmosAccountId = resourceId('Microsoft.DocumentDB/databaseAccounts', cosmosDbAccountName)

// WORKSHOP: This role assignment is critical — removing it will cause the app to fail (used in Module 5: Break It)
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-02-15-preview' = {
  name: '${cosmosDbAccountName}/${guid(cosmosAccountId, uami.id, '00000000-0000-0000-0000-000000000002')}'
  properties: {
    roleDefinitionId: '${cosmosAccountId}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: uami.properties.principalId
    scope: cosmosAccountId
  }
}

// ── Outputs ──────────────────────────────────
@description('User-Assigned Managed Identity client ID')
output uamiClientId string = uami.properties.clientId

@description('User-Assigned Managed Identity principal ID')
output uamiPrincipalId string = uami.properties.principalId

@description('User-Assigned Managed Identity resource ID')
output uamiId string = uami.id
