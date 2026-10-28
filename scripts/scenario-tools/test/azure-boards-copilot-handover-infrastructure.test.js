import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const scenarioRoot = resolve(repositoryRoot, 'scenarios', 'azure-boards-copilot-handover');
const bicepRoot = resolve(scenarioRoot, 'infra', 'bicep');

function readScenarioFile(path) {
  const fullPath = resolve(scenarioRoot, path);
  assert.ok(existsSync(fullPath), `missing scenario file: ${path}`);
  return readFileSync(fullPath, 'utf8');
}

function runBicepTest(testFile) {
  const azureConfigDirectory = process.env.AZURE_CONFIG_DIR ?? resolve(homedir(), '.azure');
  const candidates = ['bicep', resolve(azureConfigDirectory, 'bin', 'bicep')];

  for (const command of candidates) {
    const result = spawnSync(command, ['test', testFile], {
      cwd: bicepRoot,
      encoding: 'utf8',
    });
    if (result.error?.code === 'ENOENT') continue;
    return result;
  }

  assert.fail('Bicep CLI is required to execute the workload-name contract test');
}

test('Azure Boards handover manifest defines the schema-drift signal and scaffold lifecycle', () => {
  const manifest = yaml.load(readScenarioFile('scenario.yaml'));

  assert.equal(manifest.id, 'azure-boards-copilot-handover');
  assert.equal(manifest.title, 'Azure Boards Copilot Handover');
  assert.equal(manifest.platform, 'Azure Functions + Service Bus');
  assert.match(manifest.incidentType, /Service Bus schema drift/i);
  assert.match(manifest.summary, /unsupported v2 order events/i);
  assert.deepEqual(manifest.signal, {
    alertModule: 'infra/bicep/modules/active-backlog-alert.bicep',
    alertName: 'active-message-backlog',
  });
  assert.deepEqual(manifest.investigation, {
    query: 'investigation/query.kql',
  });

  for (const phase of ['setup', 'inject', 'validate', 'cleanup']) {
    assert.equal(manifest[phase].bash, `scripts/${phase}.sh`);
    assert.equal(manifest[phase].powershell, `scripts/${phase}.ps1`);
  }
});

test('Azure Boards handover uses a distinct workload name and scenario-owned resource group', () => {
  const main = readScenarioFile('infra/bicep/main.bicep');
  const workloadMatch = main.match(/param workloadName string = '([^']+)'/);

  assert.ok(workloadMatch, 'main.bicep must define a workloadName default');
  assert.equal(workloadMatch[1], 'srelabboardshandover');

  const otherDefaults = readdirSync(resolve(repositoryRoot, 'scenarios'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'azure-boards-copilot-handover')
    .flatMap((entry) => {
      const mainPath = resolve(repositoryRoot, 'scenarios', entry.name, 'infra', 'bicep', 'main.bicep');
      if (!existsSync(mainPath)) return [];
      const source = readFileSync(mainPath, 'utf8');
      return [...source.matchAll(/param workloadName string = '([^']+)'/g)]
        .map((match) => match[1]);
    });
  assert.ok(!otherDefaults.includes(workloadMatch[1]));

  assert.match(main, /targetScope = 'subscription'/);
  assert.match(main, /resource scenarioResourceGroup 'Microsoft\.Resources\/resourceGroups@/);
  assert.match(main, /var resourceGroupName = '\$\{validatedWorkloadName\}-rg'/);
  assert.match(main, /name:\s*resourceGroupName/);
});

test('Azure Boards handover rejects workload names outside its Azure-safe contract', () => {
  const result = runBicepTest('tests/invalid-workload-name.test.bicep');
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /workloadName must contain 6-24 lowercase letters, numbers, or hyphens/);
  assert.match(output, /"workloadName":\s*\{\s*"value":\s*"Invalid_Name"/);
  assert.match(output, /Evaluation Summary: Failure!/);
});

test('Azure Boards handover storage name preserves its deterministic suffix at maximum workload length', () => {
  const main = readScenarioFile('infra/bicep/main.bicep');
  const maximumWorkloadName = 'abcdefghijklmnopqrstuvwx';
  const deterministicSuffix = 'abc123';
  const expectedName = `${maximumWorkloadName.slice(0, 16)}${deterministicSuffix}st`;

  assert.equal(expectedName.length, 24);
  assert.ok(expectedName.endsWith(`${deterministicSuffix}st`));
  assert.match(main, /var storageAccountName = '\$\{take\(replace\(validatedWorkloadName, '-', ''\), 16\)\}\$\{uniqueSuffix\}st'/);
});

test('Azure Boards handover provisions managed-identity Function hosting and data resources', () => {
  const main = readScenarioFile('infra/bicep/main.bicep');
  const functionApp = readScenarioFile('infra/bicep/modules/function-app.bicep');
  const messaging = readScenarioFile('infra/bicep/modules/messaging.bicep');
  const rbac = readScenarioFile('infra/bicep/modules/rbac.bicep');
  const storage = readScenarioFile('infra/bicep/modules/storage.bicep');

  assert.match(functionApp, /Microsoft\.Web\/serverfarms@/);
  assert.match(functionApp, /name:\s*'Y1'/);
  assert.match(functionApp, /tier:\s*'Dynamic'/);
  assert.match(functionApp, /kind:\s*'functionapp,linux'/);
  assert.match(functionApp, /type:\s*'SystemAssigned'/);
  assert.match(functionApp, /linuxFxVersion:\s*'Python\|3\.12'/);
  assert.match(functionApp, /FUNCTIONS_WORKER_RUNTIME[\s\S]*value:\s*'python'/);
  assert.match(functionApp, /FUNCTIONS_EXTENSION_VERSION[\s\S]*value:\s*'~4'/);
  assert.match(functionApp, /AzureFunctionsJobHost__extensions__serviceBus__prefetchCount[\s\S]*value:\s*'0'/);
  assert.match(functionApp, /AzureFunctionsJobHost__extensions__serviceBus__maxConcurrentCalls[\s\S]*value:\s*'1'/);
  assert.match(functionApp, /WEBSITE_MAX_DYNAMIC_APPLICATION_SCALE_OUT[\s\S]*value:\s*'1'/);
  assert.match(functionApp, /ServiceBusConnection__fullyQualifiedNamespace/);
  assert.match(functionApp, /TABLE_SERVICE_ENDPOINT/);
  assert.match(functionApp, /UNSUPPORTED_EVENT_RETRY_DELAY_SECONDS[\s\S]*value:\s*'5'/);
  assert.match(functionApp, /UNSUPPORTED_EVENT_RETRY_MAX_DELAY_SECONDS[\s\S]*value:\s*'30'/);

  assert.match(messaging, /Microsoft\.ServiceBus\/namespaces@/);
  assert.match(messaging, /Microsoft\.ServiceBus\/namespaces\/queues@/);
  assert.match(messaging, /maxDeliveryCount:\s*100/);
  assert.match(messaging, /Microsoft\.Insights\/diagnosticSettings@/);
  assert.match(messaging, /workspaceId:\s*logAnalyticsWorkspaceId/);
  assert.match(messaging, /category:\s*'AllMetrics'/);
  assert.match(main, /logAnalyticsWorkspaceId:\s*monitoring\.outputs\.logAnalyticsWorkspaceId/);
  assert.match(storage, /Microsoft\.Storage\/storageAccounts@/);
  assert.match(storage, /Microsoft\.Storage\/storageAccounts\/tableServices\/tables@/);
  assert.match(storage, /normalizedreceipts/i);
  assert.match(storage, /scenariostate/i);

  assert.match(rbac, /azureServiceBusDataReceiverRoleId/);
  assert.match(rbac, /azureServiceBusDataSenderRoleId/);
  assert.match(rbac, /storageTableDataContributorRoleId/);
  assert.match(rbac, /Microsoft\.Authorization\/roleAssignments@/);
  assert.match(storage, /output receiptTableId string = normalizedReceiptsTable\.id/);
  assert.match(storage, /output scenarioStateTableId string = scenarioStateTable\.id/);
  assert.match(main, /receiptTableId:\s*storage\.outputs\.receiptTableId/);
  assert.match(main, /scenarioStateTableId:\s*storage\.outputs\.scenarioStateTableId/);
  assert.match(rbac, /param receiptTableId string/);
  assert.match(rbac, /param scenarioStateTableId string/);
  assert.match(rbac, /scope:\s*normalizedReceiptsTable/);
  assert.match(rbac, /scope:\s*scenarioStateTable/);
  assert.match(rbac, /name:\s*guid\(receiptTableId, principalId, storageTableDataContributorRoleId\)/);
  assert.match(rbac, /name:\s*guid\(scenarioStateTableId, principalId, storageTableDataContributorRoleId\)/);
  assert.doesNotMatch(rbac, /scope:\s*storageAccount/);
  assert.match(rbac, /scope:\s*orderEventsQueue/);
  assert.match(rbac, /name:\s*guid\(orderEventsQueue\.id, principalId, azureServiceBusDataReceiverRoleId\)/);
  assert.match(rbac, /name:\s*guid\(orderEventsQueue\.id, principalId, azureServiceBusDataSenderRoleId\)/);
  assert.match(main, /principalId:\s*functionApp\.outputs\.principalId/);
});

test('Azure Boards handover provisions monitoring, primary backlog alert, safety DLQ alert, and outputs', () => {
  const main = readScenarioFile('infra/bicep/main.bicep');
  const monitoring = readScenarioFile('infra/bicep/modules/monitoring.bicep');
  const backlogAlert = readScenarioFile('infra/bicep/modules/active-backlog-alert.bicep');
  const dlqAlert = readScenarioFile('infra/bicep/modules/dlq-alert.bicep');

  assert.match(monitoring, /Microsoft\.OperationalInsights\/workspaces@/);
  assert.match(monitoring, /Microsoft\.Insights\/components@/);

  assert.match(backlogAlert, /Microsoft\.Insights\/metricAlerts@/);
  assert.match(backlogAlert, /metricName:\s*'ActiveMessages'/);
  assert.match(backlogAlert, /name:\s*'EntityName'/);
  assert.match(backlogAlert, /values:\s*\[\s*queueName\s*\]/);

  assert.match(dlqAlert, /Microsoft\.Insights\/metricAlerts@/);
  assert.match(dlqAlert, /metricName:\s*'DeadletteredMessages'/);
  assert.match(dlqAlert, /name:\s*'EntityName'/);
  assert.match(dlqAlert, /values:\s*\[\s*queueName\s*\]/);

  for (const output of [
    'resourceGroupName',
    'functionAppName',
    'functionAppHostName',
    'functionPrincipalId',
    'serviceBusNamespaceName',
    'serviceBusNamespaceId',
    'queueName',
    'storageAccountName',
    'tableServiceEndpoint',
    'receiptTableName',
    'scenarioStateTableName',
    'logAnalyticsWorkspaceName',
    'logAnalyticsWorkspaceId',
    'applicationInsightsName',
    'applicationInsightsId',
    'activeBacklogAlertName',
    'dlqAlertName',
  ]) {
    assert.match(main, new RegExp(`output ${output} string`));
  }
});

test('Azure Boards handover investigation correlates backlog, exceptions, and receipt telemetry', () => {
  const query = readScenarioFile('investigation/query.kql');

  assert.match(query, /AzureMetrics/);
  assert.match(query, /ActiveMessages/);
  assert.match(query, /DeadletteredMessages/);
  assert.match(query, /AppExceptions/);
  assert.match(query, /UnsupportedReceiptSchemaError/);
  assert.match(query, /OuterMessage/);
  assert.match(query, /Details/);
  assert.match(query, /AppTraces/);
  assert.match(query, /Normalized receipt persisted/);
  assert.match(query, /parse_json/);
  assert.match(query, /source_schema_version/);
  assert.match(query, /order_id/);
});

test('Azure Boards handover guidance routes only the primary alert and requires read-only recovery proof', () => {
  const responsePlan = readScenarioFile('docs/04-configure-incident-response.md');
  const knowledge = readScenarioFile('knowledge/operational-guidelines.md');

  assert.match(responsePlan, /Azure Monitor[\s\S]*polls/i);
  assert.match(responsePlan, /azure-boards-copilot-handover-review/);
  assert.match(responsePlan, /Sev2/);
  assert.match(responsePlan, /Title contains[\s\S]*active-message-backlog/i);
  assert.match(responsePlan, /Review/);
  assert.match(responsePlan, /dead-letter[\s\S]*safety/i);
  assert.match(responsePlan, /read-only[\s\S]*recovery confirmation/i);

  assert.match(knowledge, /unsupported[\s\S]*valid v2|valid v2[\s\S]*unsupported/i);
  assert.match(knowledge, /ActiveMessages/);
  assert.match(knowledge, /UnsupportedReceiptSchemaError/);
  assert.match(knowledge, /Normalized receipt persisted/);
  assert.match(
    knowledge,
    /NormalizedReceipts[\s\S]*missing[\s\S]*v2|missing[\s\S]*v2[\s\S]*NormalizedReceipts/i,
  );
  assert.match(knowledge, /must not[\s\S]*(?:edit|modify)[\s\S]*code/i);
  assert.match(knowledge, /must not[\s\S]*(?:change|modify)[\s\S]*Azure/i);
  assert.match(knowledge, /read-only\s+recovery\s+confirmation/i);
  assert.match(knowledge, /zero active messages/i);
  assert.match(knowledge, /zero dead-letter/i);
  assert.match(knowledge, /23[\s\S]*receipts/i);
  assert.match(knowledge, /UnsupportedReceiptSchemaError[\s\S]*stopped/i);
});
