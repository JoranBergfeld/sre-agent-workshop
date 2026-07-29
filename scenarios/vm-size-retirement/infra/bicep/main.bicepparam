using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabretirement'
param adminUsername = 'azureuser'
param adminPassword = ''
param sreAgentPrincipalId = ''
param tags = {
  scenario: 'vm-size-retirement'
  environment: 'demo'
}
