// ──────────────────────────────────────────────────────────────
// PRODUCTION REFERENCE — NOT deployed by this scenario.
//
// In production, an Azure Service Health retirement advisory is routed to an
// SRE Agent incident intake by this subscription-scoped Activity Log alert.
// The scenario's injector prints a simulated advisory instead because Azure
// Service Health events cannot be created on demand. This reference is not
// imported by main.bicep and is not a runtime scenario alert.
//
// Build independently:
//   az bicep build --file ./scenarios/vm-size-retirement/infra/bicep/service-health-alert.bicep
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Resource tags')
param tags object = {}

@description('Subscription scope the Service Health alert watches')
param alertScope string = subscription().id

@description('Name for the Action Group that routes Service Health events to the SRE Agent')
param actionGroupName string = 'sre-agent-servicehealth-ag'

@description('Short name (<=12 chars) shown in notifications')
param actionGroupShortName string = 'sreagent'

@description('Webhook URI the SRE Agent (or its incident intake) exposes for Service Health events')
param sreAgentWebhookUri string

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  tags: tags
  properties: {
    groupShortName: actionGroupShortName
    enabled: true
    webhookReceivers: [
      {
        name: 'sre-agent'
        serviceUri: sreAgentWebhookUri
        useCommonAlertSchema: true
      }
    ]
  }
}

resource serviceHealthRetirementAlert 'Microsoft.Insights/activityLogAlerts@2020-10-01' = {
  name: 'service-health-vm-size-retirement'
  location: 'global'
  tags: tags
  properties: {
    enabled: true
    scopes: [
      alertScope
    ]
    condition: {
      allOf: [
        {
          field: 'category'
          equals: 'ServiceHealth'
        }
        {
          field: 'properties.incidentType'
          equals: 'ActionRequired'
        }
        {
          field: 'properties.impactedServices[*].ServiceName'
          containsAny: [
            'Virtual Machines'
          ]
        }
      ]
    }
    actions: {
      actionGroups: [
        {
          actionGroupId: actionGroup.id
        }
      ]
    }
  }
}
