using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabcpurunaway'
param adminUsername = 'azureuser'
param adminPassword = ''
param tags = {
  scenario: 'cpu-runaway'
  environment: 'demo'
}
