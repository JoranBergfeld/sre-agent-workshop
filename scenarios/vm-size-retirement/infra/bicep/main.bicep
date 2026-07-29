// ──────────────────────────────────────────────────────────────
// Azure SRE Agent Scenario — VM Size Retirement
// Composes: Monitoring → Network → VM → Identity
//
// The Service Health alert is deliberately not deployed here. See
// service-health-alert.bicep for the documented production reference.
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for VM scenario resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelabretirement'

@description('Resource tags applied to every resource')
param tags object = {
  scenario: 'vm-size-retirement'
  environment: 'demo'
}

@description('Admin username for Windows VMs')
param adminUsername string = 'azureuser'

@secure()
@description('Admin password for Windows VMs')
param adminPassword string

// 1. Monitoring must exist before VM agents emit telemetry.
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// 2. Bastion-first network access; no public IPs are assigned to the VMs.
module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

// 3. Baseline Windows/IIS workload used by the retirement simulation.
module vm 'modules/vm.bicep' = {
  name: 'vm'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
    adminUsername: adminUsername
    adminPassword: adminPassword
    subnetId: network.outputs.subnetId
  }
}

// 4. Read-only operations identity for investigation tooling.
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    workloadName: workloadName
    tags: tags
  }
}

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
