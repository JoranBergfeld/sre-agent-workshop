using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabdiskfull'
param adminUsername = 'azureuser'
param adminPassword = ''
param tags = {
  scenario: 'disk-full'
  environment: 'demo'
}
