// ──────────────────────────────────────────────────────────────
// IIS App Pool Failure scenario capsule
// Composes: Monitoring → Network → VM → Identity → scenario alert
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for VM workshop resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelabiisapppool'

@description('Resource tags applied to every resource')
param tags object = {
  scenario: 'iis-app-pool'
  environment: 'demo'
}

@description('Admin username for Windows VMs')
param adminUsername string = 'azureuser'

@secure()
@description('Admin password for Windows VMs')
param adminPassword string

// ──────────────────────────────────────────────
// 1. Monitoring (Log Analytics + App Insights)
//    Deployed first — VM agents and alerts need the workspace
// ──────────────────────────────────────────────
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 2. Network (VNet + NSG + Bastion host)
//    No public IPs on the VMs — operator access is via Bastion
// ──────────────────────────────────────────────
module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 3. Windows VMs (IIS + Azure Monitor agents)
// ──────────────────────────────────────────────
module vm 'modules/vm.bicep' = {
  name: 'vm'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    adminUsername: adminUsername
    adminPassword: adminPassword
    subnetId: network.outputs.subnetId
    dataCollectionRuleId: monitoring.outputs.dataCollectionRuleId
  }
}

// ──────────────────────────────────────────────
// 4. Operations Identity (UAMI + Reader/Monitoring Reader)
//    Constrained scope for SRE Agent investigation tooling
// ──────────────────────────────────────────────
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// ──────────────────────────────────────────────
// 5. Scheduled query alert for this scenario's IIS app-pool failure
// ──────────────────────────────────────────────
module scenarioAlert 'modules/alert.bicep' = {
  name: 'scenario-alert'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    scopeResourceId: monitoring.outputs.logAnalyticsId
  }
}

// ── Outputs ──────────────────────────────────
@description('Workshop VM names')
output vmNames array = vm.outputs.vmNames

@description('Workshop VM private IPs')
output vmPrivateIps array = vm.outputs.vmPrivateIps

@description('Log Analytics workspace ID (GUID)')
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId

@description('Application Insights connection string')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString

@description('Operations User-Assigned Managed Identity client ID')
output operationsIdentityClientId string = identity.outputs.uamiClientId

@description('Azure Bastion host name (operator access path)')
output bastionName string = network.outputs.bastionName
