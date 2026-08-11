import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { makeValidator, checkScenario } from '../lib/validate.js';

function materialize(id, title, platform) {
  const root = mkdtempSync(resolve(import.meta.dirname, 'template-'));
  const dest = resolve(root, id);
  cpSync(resolve(import.meta.dirname, '..', 'template'), dest, { recursive: true });

  const tokens = {
    __SCENARIO_ID__: id,
    __SCENARIO_TITLE__: title,
    __PLATFORM__: platform,
  };

  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }

      let text = readFileSync(path, 'utf8');
      for (const [token, value] of Object.entries(tokens)) {
        text = text.split(token).join(value);
      }
      writeFileSync(path, text);
    }
  };

  walk(dest);
  return { root, dest };
}

function isExecutable(path) {
  return (statSync(path).mode & 0o111) !== 0;
}

test('template materializes a valid standalone scenario capsule', (t) => {
  const { root, dest } = materialize('disk-full', 'Disk Full', 'Azure App Service');
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const required = [
    'README.md',
    'infra/bicep/main.bicep',
    'scenario.yaml',
    'scripts/setup.sh',
    'scripts/setup.ps1',
    'scripts/inject.sh',
    'scripts/inject.ps1',
    'scripts/validate.sh',
    'scripts/validate.ps1',
    'scripts/cleanup.sh',
    'scripts/cleanup.ps1',
  ];

  for (const rel of required) {
    assert.ok(existsSync(resolve(dest, rel)), `${rel} should exist`);
  }

  for (const rel of required.filter((rel) => rel.endsWith('.sh'))) {
    assert.ok(isExecutable(resolve(dest, rel)), `${rel} should be executable`);
  }

  const manifest = yaml.load(readFileSync(resolve(dest, 'scenario.yaml'), 'utf8'));
  assert.equal(manifest.title, 'Disk Full');
  assert.equal(manifest.platform, 'Azure App Service');
  assert.equal(manifest.summary, 'A controlled fault produces an observable service degradation for SRE Agent investigation.');
  const validate = makeValidator();
  assert.ok(validate(manifest), JSON.stringify(validate.errors));

  const errors = checkScenario(
    { id: 'disk-full', manifest, dir: dest },
    { fileExists: existsSync, isExecutable, realpath: (path) => path }
  );

  assert.deepEqual(errors, []);

  const readme = readFileSync(resolve(dest, 'README.md'), 'utf8');
  assert.match(readme, /# Scenario: Disk Full/);
  assert.match(readme, /qualitative cost estimate/i);
  assert.match(readme, /REPLACE_THIS_COST_GUIDANCE/);
  assert.doesNotMatch(readme, /\b(?:TODO|TBD)\b/);
  assert.match(readFileSync(resolve(dest, 'infra/bicep/main.bicep'), 'utf8'), /targetScope\s*=\s*'resourceGroup'/);
});
