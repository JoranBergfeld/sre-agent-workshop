using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabarcdisk'
param adminUsername = 'azureuser'
param adminPassword = ''
param tags = {
  scenario: 'arc-disk-pressure'
  environment: 'demo'
}
