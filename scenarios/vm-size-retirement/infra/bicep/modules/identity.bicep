@description('Object (principal) ID of the Azure SRE Agent managed identity. Empty disables assignments for the initial infrastructure deployment.')
param sreAgentPrincipalId string

var sreAgentAccessConfigured = !empty(sreAgentPrincipalId)

// The SRE Agent's own managed identity receives only the read permissions that
// Azure Monitor and Resource Graph investigation require.
resource sreAgentReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (sreAgentAccessConfigured) {
  name: guid(resourceGroup().id, sreAgentPrincipalId, 'sre-agent-reader')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalId: sreAgentPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource sreAgentMonitoringReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (sreAgentAccessConfigured) {
  name: guid(resourceGroup().id, sreAgentPrincipalId, 'sre-agent-monitoring-reader')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '43d0d8ad-25c7-4714-9337-8ba259a9fe05')
    principalId: sreAgentPrincipalId
    principalType: 'ServicePrincipal'
  }
}

@description('Whether the configured SRE Agent principal received Reader and Monitoring Reader')
output sreAgentAccessConfigured bool = sreAgentAccessConfigured
