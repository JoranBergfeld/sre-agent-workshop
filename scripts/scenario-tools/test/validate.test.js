import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidator, checkScenario, findDuplicateActions } from '../lib/validate.js';

const baseManifest = {
  id: 'disk-full', title: 'Disk Full', platform: 'Azure VM', incidentType: 'Capacity',
  summary: 'C: fills up', severity: 2, estimatedMinutes: 25, difficulty: 'beginner',
  costProfile: 'medium', guide: 'README.md',
  setup: { bash: 'scripts/setup.sh', powershell: 'scripts/setup.ps1' },
  inject: { bash: 'scripts/inject.sh', powershell: 'scripts/inject.ps1' },
  validate: { bash: 'scripts/validate.sh', powershell: 'scripts/validate.ps1' },
  cleanup: { bash: 'scripts/cleanup.sh', powershell: 'scripts/cleanup.ps1' },
};
const present = new Set([
  'setup.sh',
  'setup.ps1',
  'inject.sh',
  'inject.ps1',
  'validate.sh',
  'validate.ps1',
  'cleanup.sh',
  'cleanup.ps1',
  'scenario.yaml',
  'README.md',
]);
const fileExists = (p) => present.has(p.split('/').pop());

test('valid scenario yields no cross-field errors', () => {
  const validate = makeValidator();
  assert.ok(validate(baseManifest), JSON.stringify(validate.errors));

  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: { ...baseManifest, track: 'vm', docPage: 'README.md' }, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('localPath rejects absolute and rooted paths', () => {
  const validate = makeValidator();
  for (const guide of ['/etc/passwd', 'C:\\Windows\\System32', '\\rooted', '\\\\server\\share']) {
    const manifest = { ...baseManifest, guide };
    assert.equal(validate(manifest), false, `expected ${guide} to fail schema validation`);
  }
});

test('appservice scenario without remediate yields no cross-field errors', () => {
  const manifest = {
    ...baseManifest,
    id: 'cloud-agent-handover',
    title: 'SRE Agent to Copilot Handover',
  };

  const errs = checkScenario(
    { track: 'appservice', id: 'cloud-agent-handover', manifest: { ...manifest, track: 'appservice', docPage: 'README.md' }, dir: '/x/cloud-agent-handover' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('id must equal folder name', () => {
  const errs = checkScenario(
    { track: 'vm', id: 'other', manifest: { ...baseManifest, track: 'vm', docPage: 'README.md' }, dir: '/x/other' },
    { fileExists }
  );
  assert.ok(errs.some((e) => e.includes('must equal folder name')));
});

test.skip('referenced paths must remain inside the scenario directory', () => {
  const manifest = {
    ...baseManifest,
    track: 'vm',
    docPage: 'README.md',
    cleanup: { bash: '../shared/cleanup.sh', powershell: 'scripts/cleanup.ps1' },
  };

  const errs = checkScenario(
    { id: 'disk-full', manifest, dir: '/repo/scenarios/disk-full' },
    { fileExists }
  );
  assert.ok(errs.some((e) => e.includes('cleanup.bash must stay inside the scenario directory')));
});

test('missing powershell injector is reported', () => {
  const fe = (p) => fileExists(p) && !p.endsWith('inject.ps1');
  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: { ...baseManifest, track: 'vm', docPage: 'README.md' }, dir: '/x/disk-full' },
    { fileExists: fe }
  );
  assert.ok(errs.some((e) => e.includes('inject.powershell references missing file')));
});

test('non-executable .sh is reported', () => {
  const errs = checkScenario(
    { track: 'vm', id: 'disk-full', manifest: { ...baseManifest, track: 'vm', docPage: 'README.md' }, dir: '/x/disk-full' },
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
