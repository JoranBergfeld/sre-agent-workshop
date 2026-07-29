using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabidentity'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
