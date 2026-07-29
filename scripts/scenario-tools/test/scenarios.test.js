import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import yaml from 'js-yaml';

import * as paths from '../lib/paths.js';
import * as scenarioApi from '../lib/scenarios.js';
import { scenarioCandidateDirs, scenarioDirs, loadScenario, loadAllScenarios } from '../lib/scenarios.js';

function makeRepo(entries) {
  const repo = resolve(import.meta.dirname, `repo-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(repo, { recursive: true });
  mkdirSync(resolve(repo, 'scenarios'), { recursive: true });

  for (const [name, manifest] of entries) {
    const dir = resolve(repo, 'scenarios', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'scenario.yaml'), yaml.dump(manifest));
  }

  return repo;
}

test('scenario tooling exposes only top-level catalog paths and discovery APIs', () => {
  assert.deepEqual(Object.keys(paths).sort(), ['REPO_ROOT', 'ROOT_README', 'SCENARIOS_DIR']);
  assert.deepEqual(Object.keys(scenarioApi).sort(), [
    'loadAllScenarios',
    'loadScenario',
    'scenarioCandidateDirs',
    'scenarioDirs',
  ]);
});

test('scenarioCandidateDirs discovers all direct folders and scenarioDirs filters to loadable scenarios', (t) => {
  const repo = makeRepo([
    ['z-last', { id: 'z-last', platform: 'Azure VM' }],
    ['a-first', { id: 'a-first', platform: 'Azure VM' }],
  ]);

  mkdirSync(resolve(repo, 'scenarios', '.hidden'), { recursive: true });
  writeFileSync(resolve(repo, 'scenarios', '.hidden', 'scenario.yaml'), 'id: hidden\nplatform: Azure VM\n');
  mkdirSync(resolve(repo, 'scenarios', '_template'), { recursive: true });
  writeFileSync(resolve(repo, 'scenarios', '_template', 'scenario.yaml'), 'id: template\nplatform: Azure VM\n');
  mkdirSync(resolve(repo, 'scenarios', 'nested', 'child'), { recursive: true });
  writeFileSync(resolve(repo, 'scenarios', 'nested', 'child', 'scenario.yaml'), 'id: child\nplatform: Azure VM\n');
  mkdirSync(resolve(repo, 'scenarios', 'no-manifest'), { recursive: true });

  t.after(() => rmSync(repo, { recursive: true, force: true }));

  const candidates = scenarioCandidateDirs(resolve(repo, 'scenarios'));
  assert.deepEqual(candidates.map((dir) => basename(dir)), ['a-first', 'nested', 'no-manifest', 'z-last']);

  const dirs = scenarioDirs(resolve(repo, 'scenarios'));
  assert.deepEqual(dirs.map((dir) => basename(dir)), ['a-first', 'z-last']);
});

test('scenarioCandidateDirs rejects capsule roots symlinked outside scenarios', (t) => {
  const repo = makeRepo([
    ['local', { id: 'local', platform: 'Azure VM' }],
  ]);
  const external = resolve(repo, 'external-capsule');
  mkdirSync(external, { recursive: true });
  writeFileSync(
    resolve(external, 'scenario.yaml'),
    yaml.dump({ id: 'external', platform: 'Azure VM' })
  );
  symlinkSync(external, resolve(repo, 'scenarios', 'external'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  const candidates = scenarioCandidateDirs(resolve(repo, 'scenarios'));
  assert.deepEqual(candidates.map((dir) => basename(dir)), ['local']);
  assert.deepEqual(
    scenarioDirs(resolve(repo, 'scenarios')).map((dir) => basename(dir)),
    ['local']
  );
});

test('loadScenario derives the id from the folder and reads the manifest platform', (t) => {
  const repo = makeRepo([
    ['disk-full', { id: 'wrong-id', platform: 'Azure VM', title: 'Disk Full' }],
  ]);
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  const loaded = loadScenario(resolve(repo, 'scenarios', 'disk-full'));
  assert.equal(loaded.id, 'disk-full');
  assert.equal(loaded.dir, resolve(repo, 'scenarios', 'disk-full'));
  assert.equal(loaded.manifest.platform, 'Azure VM');
});

test('loadAllScenarios loads every direct scenario folder in sorted order', (t) => {
  const repo = makeRepo([
    ['z-last', { id: 'z-last', platform: 'Azure VM' }],
    ['a-first', { id: 'a-first', platform: 'Azure VM' }],
  ]);
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  const scenarios = loadAllScenarios(resolve(repo, 'scenarios'));
  assert.deepEqual(scenarios.map((s) => s.id), ['a-first', 'z-last']);
});
