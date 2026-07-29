using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabcosmos'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
