param workloadName string
param serviceBusNamespaceId string
param queueName string
param tags object

resource activeMessageBacklogAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${workloadName}-active-message-backlog'
  location: 'global'
  tags: tags
  properties: {
    description: 'Primary scenario signal: unsupported order events are accumulating in the active queue backlog.'
    severity: 2
    enabled: true
    scopes: [
      serviceBusNamespaceId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.MultipleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ActiveMessageBacklog'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'ActiveMessages'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            {
              name: 'EntityName'
              operator: 'Include'
              values: [
                queueName
              ]
            }
          ]
          skipMetricValidation: false
        }
      ]
    }
  }
}

output alertName string = activeMessageBacklogAlert.name
