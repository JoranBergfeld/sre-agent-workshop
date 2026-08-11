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

for (const scenarioDirectory of scenarioDirectories) {
  test(`${scenarioDirectory} guide documents its cost profile`, () => {
    const scenarioRoot = resolve(scenariosRoot, scenarioDirectory);
    const manifest = yaml.load(readFileSync(resolve(scenarioRoot, 'scenario.yaml'), 'utf8'));
    const guide = readFileSync(resolve(scenarioRoot, manifest.guide), 'utf8');

    assert.match(guide, /^## Cost profile$/m);
    assert.match(guide, new RegExp(`\\*\\*${manifest.costProfile}\\*\\*`, 'i'));
    assert.match(guide, /dominant cost drivers/i);
  });
}
