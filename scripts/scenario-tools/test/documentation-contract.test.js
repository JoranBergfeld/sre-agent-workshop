import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');
const aksScenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const canonicalTemplateUrl = 'https://github.com/JoranBergfeld/sre-agent-workshop/generate';
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
      prerequisites.includes(canonicalTemplateUrl),
      `${scenario} prerequisites must contain ${canonicalTemplateUrl}`,
    );
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
