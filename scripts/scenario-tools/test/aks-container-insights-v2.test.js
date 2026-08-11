import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const scenarios = {
  'cosmos-rbac-removal': 'cosmos-rbac-removal',
  'workload-identity-break': 'workload-identity-break',
};

function readMarkdownTree(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);

    if (entry.isDirectory()) {
      return readMarkdownTree(path);
    }

    return entry.isFile() && entry.name.endsWith('.md')
      ? [{ path, content: readFileSync(path, 'utf8') }]
      : [];
  });
}

for (const [scenario, namespace] of Object.entries(scenarios)) {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios', scenario);
  const bicepRoot = resolve(scenarioRoot, 'infra', 'bicep');

  test(`${scenario} provisions and associates a ContainerLogV2 data collection rule`, () => {
    const monitoring = readFileSync(resolve(bicepRoot, 'modules', 'monitoring.bicep'), 'utf8');
    const aks = readFileSync(resolve(bicepRoot, 'modules', 'aks.bicep'), 'utf8');
    const main = readFileSync(resolve(bicepRoot, 'main.bicep'), 'utf8');

    assert.match(monitoring, /Microsoft\.Insights\/dataCollectionRules@/);
    assert.match(monitoring, /Microsoft-ContainerLogV2/);
    assert.match(monitoring, /enableContainerLogV2:\s*true/);
    assert.match(monitoring, /output containerInsightsDcrId string = \w+\.id/);

    assert.match(aks, /param containerInsightsDcrId string/);
    assert.match(aks, /Microsoft\.Insights\/dataCollectionRuleAssociations@/);
    assert.match(aks, /scope:\s*aks/);
    assert.match(aks, /dataCollectionRuleId:\s*containerInsightsDcrId/);

    assert.match(
      main,
      /containerInsightsDcrId:\s*monitoring\.outputs\.containerInsightsDcrId/,
    );
  });

  test(`${scenario} alerts and investigation query use native ContainerLogV2 fields`, () => {
    const alert = readFileSync(resolve(bicepRoot, 'modules', 'alert.bicep'), 'utf8');
    const investigation = readFileSync(resolve(scenarioRoot, 'investigation', 'query.kql'), 'utf8');

    for (const [path, query] of [
      ['alert.bicep', alert],
      ['investigation/query.kql', investigation],
    ]) {
      assert.match(query, /\bContainerLogV2\b/, `${path} must query ContainerLogV2`);
      assert.match(
        query,
        new RegExp(`PodNamespace == "${namespace}"`),
        `${path} must filter the fixed scenario namespace`,
      );
      assert.match(
        query,
        /\|\s*extend LogText = tostring\(LogMessage\)/,
        `${path} must convert dynamic LogMessage values to strings`,
      );
      const stringFilterFields = [
        ...query.matchAll(/\b(\w+)\s+(?:has|contains)\s+"/g),
      ].map((match) => match[1]);
      assert.ok(stringFilterFields.length > 0, `${path} must filter log message text`);
      assert.deepEqual(
        [...new Set(stringFilterFields)],
        ['LogText'],
        `${path} must apply string filters only to converted LogText values`,
      );
      assert.doesNotMatch(query, /\bContainerLog\b/, `${path} uses legacy ContainerLog`);
      assert.doesNotMatch(query, /\bLogEntry\b/, `${path} uses legacy LogEntry`);
      assert.doesNotMatch(query, /\bKubePodInventory\b/, `${path} retains an unnecessary inventory join`);
    }

    assert.match(alert, /summarize \w+ = count\(\) by bin\(TimeGenerated, 5m\)/);
    assert.match(
      investigation,
      /project TimeGenerated, PodName, ContainerName, LogText, LogLevel/,
    );
  });

  test(`${scenario} metadata and learner documentation definitively use ContainerLogV2`, () => {
    const scenarioContent = [
      {
        path: resolve(scenarioRoot, 'scenario.yaml'),
        content: readFileSync(resolve(scenarioRoot, 'scenario.yaml'), 'utf8'),
      },
      {
        path: resolve(scenarioRoot, 'README.md'),
        content: readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8'),
      },
      ...readMarkdownTree(resolve(scenarioRoot, 'docs')),
    ];

    assert.ok(
      scenarioContent.some(({ content }) => /\bContainerLogV2\b/.test(content)),
      `${scenario} metadata or learner documentation must name ContainerLogV2`,
    );

    for (const document of scenarioContent) {
      assert.doesNotMatch(
        document.content,
        /\bContainerLog\b/,
        `${document.path} refers to legacy ContainerLog`,
      );
      assert.doesNotMatch(
        document.content,
        /ContainerLogV2\s*\/\s*ContainerLog|ContainerLog\s*\/\s*ContainerLogV2/i,
        `${document.path} claims collection-table ambiguity`,
      );
    }
  });
}
