import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');
const aksScenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const canonicalTemplateUrl = 'https://github.com/JoranBergfeld/sre-agent-workshop/generate';
const canonicalTemplateLink = `[**Use this template**](${canonicalTemplateUrl})`;
const githubMcpAnchor = '#set-up-the-github-mcp-connector-with-a-pat';
const oldGithubConnectorAnchor = '#set-up-the-github-connector-with-a-pat';
const scenarioDirectories = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();

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

function assertCostGuidance(guide, costProfile) {
  assert.match(guide, /^## Cost profile$/m);
  assert.match(guide, new RegExp(`\\*\\*${costProfile}\\*\\*`, 'i'));
  assert.match(guide, /dominant cost drivers/i);
  assert.doesNotMatch(
    guide,
    /REPLACE_THIS_COST_GUIDANCE/,
    'guide contains unresolved cost guidance marker REPLACE_THIS_COST_GUIDANCE',
  );
}

for (const scenario of aksScenarios) {
  test(`${scenario} learner documentation uses generated repository terminology`, () => {
    const scenarioRoot = resolve(scenariosRoot, scenario);
    const learnerDocumentation = [
      {
        path: resolve(scenarioRoot, 'README.md'),
        content: readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8'),
      },
      ...readMarkdownTree(resolve(scenarioRoot, 'docs')),
    ];

    for (const document of learnerDocumentation) {
      assert.doesNotMatch(
        document.content,
        /\byour fork\b|\bfork the repository\b|\bdelete your fork\b/i,
        `${document.path} uses learner fork terminology`,
      );
    }
  });

  test(`${scenario} prerequisites define canonical workload variables`, () => {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '00-prerequisites.md'),
      'utf8',
    );

    assert.match(prerequisites, /^WORKLOAD_NAME="[^"]+"$/m);
    assert.match(prerequisites, /^RESOURCE_GROUP="rg-\${WORKLOAD_NAME}"$/m);
    assert.match(prerequisites, /^\$WorkloadName = "[^"]+"$/m);
    assert.match(prerequisites, /^\$ResourceGroup = "rg-\${WorkloadName}"$/m);
  });

  test(`${scenario} prerequisites link directly to the canonical template generator`, () => {
    const prerequisites = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '00-prerequisites.md'),
      'utf8',
    );

    assert.ok(
      prerequisites.includes(canonicalTemplateLink),
      `${scenario} prerequisites must contain ${canonicalTemplateLink}`,
    );
  });

  test(`${scenario} onboarding follows the current agent setup flow`, () => {
    const onboarding = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '03-onboard-sre-agent.md'),
      'utf8',
    );

    assert.match(onboarding, /\bQuickstart\b/);
    assert.match(onboarding, /\bFull setup\b/);
    assert.match(onboarding, /Favorites sidebar/);
    assert.ok(onboarding.includes(githubMcpAnchor));
    assert.doesNotMatch(onboarding, new RegExp(oldGithubConnectorAnchor));
    assert.doesNotMatch(onboarding, /If all three checks pass/);
    assert.doesNotMatch(onboarding, /Monitor\s*→\s*Resource Mapping/);

    const verifySetup = onboarding.match(
      /^## Verify Setup\s*$([\s\S]*?)(?=^##\s|\Z)/m,
    )?.[1];
    assert.ok(verifySetup, `${scenario} onboarding must include Verify Setup`);

    const checklist = verifySetup.match(/^- \[ \].+$/gm) ?? [];
    assert.equal(checklist.length, 4);
    assert.match(verifySetup, /Code.*green check/i);
    assert.match(verifySetup, /Azure Resources.*\$RESOURCE_GROUP.*permissions complete/i);
    assert.match(verifySetup, /operational-guidelines\.md.*File.*Indexed/i);
    assert.match(verifySetup, /read-only.*issues/i);
  });

  test(`${scenario} incident prerequisites use shell account checks and portal permissions`, () => {
    const incidentResponse = readFileSync(
      resolve(scenariosRoot, scenario, 'docs', '04-configure-incident-response.md'),
      'utf8',
    );

    assert.match(incidentResponse, /\*\*Bash\*\*/);
    assert.match(incidentResponse, /\*\*PowerShell\*\*/);
    assert.match(incidentResponse, /az login/);
    assert.match(incidentResponse, /az account set --subscription "\$SUBSCRIPTION_ID"/);
    assert.match(incidentResponse, /az account set --subscription \$SubscriptionId/);
    assert.match(incidentResponse, /Full setup/);
    assert.match(incidentResponse, /Azure Resources/);
    assert.match(incidentResponse, /permissions complete/i);
    assert.doesNotMatch(incidentResponse, /Microsoft\.ManagedIdentity/);
    assert.doesNotMatch(incidentResponse, /az identity show/);
    assert.doesNotMatch(incidentResponse, /az role assignment list/);
  });
}

test('cost guidance rejects the unresolved scaffold marker', () => {
  const guide = `## Cost profile

The cost profile is **low**. REPLACE_THIS_COST_GUIDANCE with dominant cost drivers.
`;

  assert.throws(
    () => assertCostGuidance(guide, 'low'),
    /REPLACE_THIS_COST_GUIDANCE/,
  );
});

for (const scenarioDirectory of scenarioDirectories) {
  test(`${scenarioDirectory} guide documents its cost profile`, () => {
    const scenarioRoot = resolve(scenariosRoot, scenarioDirectory);
    const manifest = yaml.load(readFileSync(resolve(scenarioRoot, 'scenario.yaml'), 'utf8'));
    const guide = readFileSync(resolve(scenarioRoot, manifest.guide), 'utf8');

    assertCostGuidance(guide, manifest.costProfile);
  });
}
