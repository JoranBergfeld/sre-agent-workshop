// ──────────────────────────────────────────────────────────────
// Azure SRE Agent Scenario — Disk Full (C: Pressure)
// Composes the self-contained VM workload and its disk-pressure alert.
// ──────────────────────────────────────────────────────────────

targetScope = 'resourceGroup'

@description('Azure region for the Disk Full scenario resources')
@allowed([
  'eastus2'
  'swedencentral'
  'australiaeast'
])
param location string = 'eastus2'

@description('Unique base workload name used in resource naming ({workloadName}-{type})')
param workloadName string = 'srelabdiskfull'

@description('Resource tags applied to every resource')
param tags object = {
  scenario: 'disk-full'
  environment: 'demo'
}

@description('Admin username for Windows VMs')
param adminUsername string = 'azureuser'

@secure()
@description('Admin password for Windows VMs')
param adminPassword string

// ──────────────────────────────────────────────
// 1. Monitoring (Log Analytics + App Insights)
//    Deployed first because VM agents and the alert use the workspace.
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
//    No public IPs are assigned to VMs; operators use Bastion.
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
    logAnalyticsResourceId: monitoring.outputs.logAnalyticsId
  }
}

// ──────────────────────────────────────────────
// 4. Operations Identity (UAMI + Reader/Monitoring Reader)
//    Constrained scope for investigation tooling.
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
// 5. Scenario-owned scheduled query alert (C: free-space pressure)
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

@description('Windows computer names used by Log Analytics Perf records')
output vmComputerNames array = vm.outputs.vmComputerNames

@description('Log Analytics workspace ID (GUID)')
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId

@description('Application Insights connection string')
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString

@description('Operations User-Assigned Managed Identity client ID')
output operationsIdentityClientId string = identity.outputs.uamiClientId

@description('Azure Bastion host name (operator access path)')
output bastionName string = network.outputs.bastionName
