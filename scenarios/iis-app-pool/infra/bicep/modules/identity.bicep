@description('Azure region for identity resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

// ──────────────────────────────────────────────
// Operations User-Assigned Managed Identity
// Used by SRE Agent investigation tooling.
// ──────────────────────────────────────────────
resource operationsIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${workloadName}-ops-id'
  location: location
  tags: tags
}

// ──────────────────────────────────────────────
// Constrained role assignments (read-only investigation scope)
// ──────────────────────────────────────────────
resource readerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, operationsIdentity.id, 'reader')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalId: operationsIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource monitoringReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, operationsIdentity.id, 'monitoring-reader')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05')
    principalId: operationsIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ──────────────────────────────────
@description('Operations UAMI client ID')
output uamiClientId string = operationsIdentity.properties.clientId

@description('Operations UAMI principal ID')
output uamiPrincipalId string = operationsIdentity.properties.principalId

@description('Operations UAMI resource ID')
output uamiId string = operationsIdentity.id
