using './main.bicep'

param location = 'eastus2'
param workloadName = 'srelabapp'
param githubRepository = 'owner/repository'
param tags = {
  workshop: 'sre-agent'
  environment: 'demo'
}
