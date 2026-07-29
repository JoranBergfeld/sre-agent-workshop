using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabiisapppool'
param adminUsername = 'azureuser'
param adminPassword = ''
param tags = {
  scenario: 'iis-app-pool'
  environment: 'demo'
}
