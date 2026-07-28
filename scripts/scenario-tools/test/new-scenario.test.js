import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, '..', 'bin', 'new-scenario.js');

function makeRoot() {
  const root = mkdtempSync(resolve(import.meta.dirname, 'new-scenario-'));
  mkdirSync(resolve(root, 'scenarios'), { recursive: true });
  return root;
}

function run(args, root) {
  return spawnSync(process.execPath, [script, ...args], {
    env: {
      ...process.env,
      SCENARIO_TOOLS_REPO_ROOT: root,
    },
    encoding: 'utf8',
  });
}

test('creates a standalone scenario under scenarios/<id>', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['disk-full', 'Disk Full', '--platform=Azure App Service'], root);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(resolve(root, 'scenarios', 'disk-full', 'scenario.yaml')));
  assert.ok(result.stdout.includes(`Created scenario disk-full (Azure App Service) at ${resolve(root, 'scenarios', 'disk-full')}`));
  assert.ok(result.stdout.includes('Next steps:'));
  assert.ok(result.stdout.includes('Run: scripts/validate-scenarios.sh --write'));

  const manifest = readFileSync(resolve(root, 'scenarios', 'disk-full', 'scenario.yaml'), 'utf8');
  assert.match(manifest, /platform: Azure App Service/);
  assert.match(manifest, /id: disk-full/);
  assert.match(manifest, /title: Disk Full/);
  assert.match(manifest, /summary: A controlled fault produces an observable service degradation for SRE Agent investigation\./);
});

test('rejects a missing platform', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['disk-full', 'Disk Full'], root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--platform/);
});

test('rejects invalid ids', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['Disk Full', 'Disk Full', '--platform', 'Azure App Service'], root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid id/);
});

test('rejects duplicate platform options', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['disk-full', 'Disk Full', '--platform', 'Azure App Service', '--platform=AKS'], root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Duplicate --platform option/);
});

test('rejects an existing destination', (t) => {
  const root = makeRoot();
  mkdirSync(resolve(root, 'scenarios', 'disk-full'), { recursive: true });
  writeFileSync(resolve(root, 'scenarios', 'disk-full', 'scenario.yaml'), 'id: disk-full\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['disk-full', 'Disk Full', '--platform', 'Azure App Service'], root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Scenario already exists/);
});

test('rejects unknown options', (t) => {
  const root = makeRoot();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run(['disk-full', 'Disk Full', '--bogus'], root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown option/);
});
