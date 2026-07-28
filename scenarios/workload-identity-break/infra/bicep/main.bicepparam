using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelab'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
