import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

import { REPO_ROOT } from '../lib/paths.js';

const scenariosRoot = resolve(REPO_ROOT, 'scenarios');
const scenarioDirectories = readdirSync(scenariosRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();

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
