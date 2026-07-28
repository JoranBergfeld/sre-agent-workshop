@description('Azure region for the AKS cluster')
param location string

@description('Base name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Log Analytics workspace resource ID for Container Insights')
param logAnalyticsWorkspaceId string

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
    kubernetesVersion: '1.34'

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
        vmSize: 'Standard_D2ads_v6'
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
        }
      }
    }

    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'azure'
    }
  }
}

// ── Outputs ──────────────────────────────────
@description('AKS cluster name')
output clusterName string = aks.name

@description('AKS cluster resource ID')
output clusterId string = aks.id

@description('AKS OIDC issuer URL (used for federated identity credentials)')
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
