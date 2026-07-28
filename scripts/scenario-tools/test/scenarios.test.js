import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import yaml from 'js-yaml';

import { scenarioDirs, loadScenario, loadAllScenarios, legacyScenarioDirs } from '../lib/scenarios.js';

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

function makeLegacyRepo(rootEntries, legacyEntries) {
  const repo = resolve(import.meta.dirname, `legacy-repo-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(resolve(repo, 'scenarios'), { recursive: true });
  mkdirSync(resolve(repo, 'workshops', 'vm', 'scenarios'), { recursive: true });

  for (const [name, manifest] of rootEntries) {
    const dir = resolve(repo, 'scenarios', name);
    mkdirSync(dir, { recursive: true });
    if (manifest) {
      writeFileSync(resolve(dir, 'scenario.yaml'), yaml.dump(manifest));
    }
  }

  for (const [name, manifest] of legacyEntries) {
    const dir = resolve(repo, 'workshops', 'vm', 'scenarios', name);
    mkdirSync(dir, { recursive: true });
    if (manifest) {
      writeFileSync(resolve(dir, 'scenario.yaml'), yaml.dump(manifest));
    }
  }

  return repo;
}

test('scenarioDirs discovers only direct scenario folders, skips hidden templates, and sorts results', (t) => {
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

  const dirs = scenarioDirs(resolve(repo, 'scenarios'));
  assert.deepEqual(dirs.map((dir) => basename(dir)), ['a-first', 'z-last']);
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

test('legacyScenarioDirs returns direct legacy folders even without manifests', (t) => {
  const repo = makeLegacyRepo(
    [
      ['with-manifest', { id: 'with-manifest', platform: 'Azure VM' }],
      ['without-manifest', null],
      ['.hidden', { id: 'hidden', platform: 'Azure VM' }],
      ['_template', { id: 'template', platform: 'Azure VM' }],
    ],
    [
      ['legacy-with-manifest', { id: 'legacy-with-manifest', platform: 'Azure VM' }],
      ['legacy-without-manifest', null],
      ['.hidden', { id: 'hidden', platform: 'Azure VM' }],
      ['_template', { id: 'template', platform: 'Azure VM' }],
    ]
  );
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  const rootDirs = scenarioDirs(resolve(repo, 'scenarios'));
  assert.deepEqual(rootDirs.map((dir) => basename(dir)), ['with-manifest']);

  const legacyDirs = legacyScenarioDirs('vm', resolve(repo, 'workshops'));
  assert.deepEqual(legacyDirs.map((dir) => basename(dir)), ['legacy-with-manifest', 'legacy-without-manifest']);
});
