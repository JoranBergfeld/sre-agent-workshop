@description('Azure region for VM resources')
param location string

@description('Base workload name for resource naming')
param workloadName string

@description('Resource tags')
param tags object

@description('Admin username for Windows VMs')
param adminUsername string

@secure()
@description('Admin password for Windows VMs')
param adminPassword string

@description('Subnet resource ID for VM NICs')
param subnetId string

@description('Data Collection Rule resource ID for IIS System event telemetry')
param dataCollectionRuleId string

// Windows computer names may not exceed 15 characters. This deterministic
// prefix keeps resource and computer names short for every workload name.
var vmNamePrefix = take(replace(workloadName, '-', ''), 10)
var vmNames = [
  '${vmNamePrefix}-01'
  '${vmNamePrefix}-02'
]

// ──────────────────────────────────────────────
// NICs (private IPs only — Bastion is the access path)
// ──────────────────────────────────────────────
resource nic 'Microsoft.Network/networkInterfaces@2023-11-01' = [for (vmName, i) in vmNames: {
  name: '${vmName}-nic'
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          subnet: {
            id: subnetId
          }
          privateIPAllocationMethod: 'Dynamic'
        }
      }
    ]
  }
}]

// ──────────────────────────────────────────────
// Windows Server VMs (B-series for cost-efficient lab runtime)
// ──────────────────────────────────────────────
resource vm 'Microsoft.Compute/virtualMachines@2023-09-01' = [for (vmName, i) in vmNames: {
  name: vmName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    hardwareProfile: {
      vmSize: 'Standard_B2s'
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      adminPassword: adminPassword
      windowsConfiguration: {
        provisionVMAgent: true
        enableAutomaticUpdates: true
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-azure-edition'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic[i].id
          properties: {
            primary: true
          }
        }
      ]
    }
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}]

// ──────────────────────────────────────────────
// IIS baseline (the workload exercised by scenarios)
// ──────────────────────────────────────────────
resource installIis 'Microsoft.Compute/virtualMachines/extensions@2023-09-01' = [for (vmName, i) in vmNames: {
  parent: vm[i]
  name: 'installIis'
  location: location
  properties: {
    publisher: 'Microsoft.Compute'
    type: 'CustomScriptExtension'
    typeHandlerVersion: '1.10'
    autoUpgradeMinorVersion: true
    settings: {
      commandToExecute: 'powershell -ExecutionPolicy Unrestricted -Command "Install-WindowsFeature Web-Server; Set-Content -Path C:\\inetpub\\wwwroot\\index.html -Value VMWorkshopDemo"'
    }
  }
}]

// ──────────────────────────────────────────────
// Azure Monitor + Dependency agents (VM Insights signals)
// ──────────────────────────────────────────────
resource amaExtension 'Microsoft.Compute/virtualMachines/extensions@2023-09-01' = [for (vmName, i) in vmNames: {
  parent: vm[i]
  name: 'AzureMonitorWindowsAgent'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.Monitor'
    type: 'AzureMonitorWindowsAgent'
    typeHandlerVersion: '1.20'
    autoUpgradeMinorVersion: true
  }
}]

// Associate the workspace-bound DCR with each AMA-enabled VM so the Event
// table receives the System events queried by the IIS app-pool alert.
resource iisEventCollectionAssociation 'Microsoft.Insights/dataCollectionRuleAssociations@2022-06-01' = [for (vmName, i) in vmNames: {
  name: 'iis-app-pool-events'
  scope: vm[i]
  properties: {
    dataCollectionRuleId: dataCollectionRuleId
  }
  dependsOn: [
    amaExtension[i]
  ]
}]

resource dependencyAgent 'Microsoft.Compute/virtualMachines/extensions@2023-09-01' = [for (vmName, i) in vmNames: {
  parent: vm[i]
  name: 'DependencyAgentWindows'
  location: location
  properties: {
    publisher: 'Microsoft.Azure.Monitoring.DependencyAgent'
    type: 'DependencyAgentWindows'
    typeHandlerVersion: '9.10'
    autoUpgradeMinorVersion: true
  }
}]

// ──────────────────────────────────────────────
// Daily auto-shutdown (UTC 19:00) — keeps lab cost contained
// Schedule name pattern is required by Microsoft.DevTestLab
// ──────────────────────────────────────────────
resource autoShutdownSchedule 'Microsoft.DevTestLab/schedules@2018-09-15' = [for (vmName, i) in vmNames: {
  name: 'shutdown-computevm-${vmName}'
  location: location
  properties: {
    status: 'Enabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: '1900'
    }
    timeZoneId: 'UTC'
    targetResourceId: vm[i].id
    notificationSettings: {
      status: 'Disabled'
      timeInMinutes: 30
    }
  }
}]

// ── Outputs ──────────────────────────────────
@description('Workshop VM names')
output vmNames array = vmNames

@description('Workshop VM resource IDs')
output vmIds array = [for (name, i) in vmNames: vm[i].id]

@description('Workshop VM private IPs')
output vmPrivateIps array = [for (name, i) in vmNames: nic[i].properties.ipConfigurations[0].properties.privateIPAddress]
