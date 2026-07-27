import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkScenario, findDuplicateActions } from '../lib/validate.js';

const baseManifest = {
  id: 'disk-full', title: 'Disk Full', track: 'vm', summary: 's', severity: 2,
  inject: { bash: 'inject.sh', powershell: 'inject.ps1' },
  validate: { bash: 'validate.sh', powershell: 'validate.ps1' },
  docPage: 'README.md',
};
const present = new Set(['inject.sh', 'inject.ps1', 'validate.sh', 'validate.ps1', 'scenario.yaml', 'README.md']);
const fileExists = (p) => present.has(p.split('/').pop());

test('valid scenario yields no cross-field errors', () => {
  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('appservice scenario without remediate yields no cross-field errors', () => {
  const manifest = {
    ...baseManifest,
    id: 'cloud-agent-handover',
    title: 'SRE Agent to Copilot Handover',
    track: 'appservice',
  };

  const errs = checkScenario(
    { track: 'appservice', id: 'cloud-agent-handover', manifest, dir: '/x/cloud-agent-handover' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('id must equal folder name', () => {
  const errs = checkScenario(
    { track: 'vm', id: 'other', manifest: baseManifest, dir: '/x/other' },
    { fileExists }
  );
  assert.ok(errs.some((e) => e.includes('must equal folder name')));
});

test('track must equal parent track directory', () => {
  const errs = checkScenario(
    { track: 'aks', id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.ok(errs.some((e) => e.includes('must equal parent track')));
});

test('missing powershell injector is reported', () => {
  const fe = (p) => fileExists(p) && !p.endsWith('inject.ps1');
  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists: fe }
  );
  assert.ok(errs.some((e) => e.includes('inject.powershell references missing file')));
});

test('non-executable .sh is reported', () => {
  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists, isExecutable: () => false }
  );
  assert.ok(errs.some((e) => e.includes('must be executable')));
});

test('findDuplicateActions flags an action reused across scenarios', () => {
  const scenarios = [
    { id: 'a', manifest: { remediate: [{ action: 'restart' }] } },
    { id: 'b', manifest: { remediate: [{ action: 'restart' }, { action: 'flush' }] } },
  ];
  const dups = findDuplicateActions(scenarios);
  assert.deepEqual(dups, [{ action: 'restart', ids: ['a', 'b'] }]);
});

test('findDuplicateActions returns empty when all unique', () => {
  const scenarios = [
    { id: 'a', manifest: { remediate: [{ action: 'cleanup-disk' }] } },
    { id: 'b', manifest: { remediate: [{ action: 'start-iis-app-pool' }] } },
  ];
  assert.deepEqual(findDuplicateActions(scenarios), []);
});
