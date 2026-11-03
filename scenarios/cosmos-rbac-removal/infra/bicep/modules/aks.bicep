@description('Azure region for the AKS cluster')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Log Analytics workspace resource ID for Container Insights')
param logAnalyticsWorkspaceId string

@description('Container Insights data collection rule resource ID')
param containerInsightsDcrId string

@description('Kubernetes major.minor version. Selected by scripts/placement from versions generally available in the chosen region.')
param kubernetesVersion string = '1.34'

@description('System node pool VM size. Selected by scripts/placement from the scenario policy (infra/placement.json).')
param systemNodeVmSize string = 'Standard_D2ads_v6'

// ──────────────────────────────────────────────
// AKS Cluster
// ──────────────────────────────────────────────
resource aks 'Microsoft.ContainerService/managedClusters@2024-01-01' = {
  name: '${workloadName}-aks'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: '${workloadName}-aks'
    kubernetesVersion: kubernetesVersion

    // Workload Identity support
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }

    // Default Linux node pool
    agentPoolProfiles: [
      {
        name: 'system'
        count: 2
        vmSize: systemNodeVmSize
        osType: 'Linux'
        mode: 'System'
        enableAutoScaling: false
      }
    ]

    // Azure Monitor (Container Insights) addon
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalyticsWorkspaceId
          useAADAuth: 'true'
        }
      }
    }

    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'azure'
    }
  }
}

resource containerInsightsDcrAssociation 'Microsoft.Insights/dataCollectionRuleAssociations@2022-06-01' = {
  name: 'ContainerInsightsExtension'
  scope: aks
  properties: {
    dataCollectionRuleId: containerInsightsDcrId
  }
}

// ── Outputs ──────────────────────────────────
@description('AKS cluster name')
output clusterName string = aks.name

@description('AKS cluster resource ID')
output clusterId string = aks.id

@description('AKS OIDC issuer URL (used for federated identity credentials)')
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
