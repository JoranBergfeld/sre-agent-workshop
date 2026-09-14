param workloadName string
param serviceBusNamespaceId string
param queueName string
param tags object

resource deadLetterSafetyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${workloadName}-dead-letter-safety'
  location: 'global'
  tags: tags
  properties: {
    description: 'Safety signal: any dead-lettered order event requires review because unsupported events should remain active.'
    severity: 1
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
          name: 'DeadLetteredMessages'
          metricNamespace: 'Microsoft.ServiceBus/namespaces'
          metricName: 'DeadletteredMessages'
          operator: 'GreaterThan'
          threshold: 0
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

output alertName string = deadLetterSafetyAlert.name
