import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeValidator, checkScenario, findDuplicateActions } from '../lib/validate.js';

const baseManifest = {
  id: 'disk-full',
  title: 'Disk Full',
  platform: 'Azure VM',
  incidentType: 'Capacity',
  summary: 'C: fills up',
  severity: 2,
  estimatedMinutes: 25,
  difficulty: 'beginner',
  costProfile: 'medium',
  guide: 'README.md',
  setup: { bash: 'scripts/setup.sh', powershell: 'scripts/setup.ps1' },
  inject: { bash: 'scripts/inject.sh', powershell: 'scripts/inject.ps1' },
  validate: { bash: 'scripts/validate.sh', powershell: 'scripts/validate.ps1' },
  cleanup: { bash: 'scripts/cleanup.sh', powershell: 'scripts/cleanup.ps1' },
  signal: { alertModule: 'alerts/disk-full.bicep', alertName: 'Disk Full' },
  investigation: { query: 'queries/disk-full.kql' },
  source: 'src/app/server.js',
  tests: 'tests/integration.spec.js',
  remediate: [
    { action: 'restart', bash: 'remediate/restart.sh', powershell: 'remediate/restart.ps1', description: 'Restart' },
  ],
};

const present = new Set([
  'scenario.yaml',
  'README.md',
  'setup.sh',
  'setup.ps1',
  'inject.sh',
  'inject.ps1',
  'validate.sh',
  'validate.ps1',
  'cleanup.sh',
  'cleanup.ps1',
  'disk-full.bicep',
  'disk-full.kql',
  'server.js',
  'integration.spec.js',
  'restart.sh',
  'restart.ps1',
]);

const fileExists = (p) => present.has(p.split('/').pop());

test('valid scenario yields no cross-field errors', () => {
  const validate = makeValidator();
  assert.ok(validate(baseManifest), JSON.stringify(validate.errors));

  const errs = checkScenario(
    { id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('missing guide is reported', () => {
  const manifest = { ...baseManifest };
  delete manifest.guide;

  const errs = checkScenario(
    { id: 'disk-full', manifest, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.ok(errs.includes('guide is required'));
});

test('setup and cleanup pairs are validated', () => {
  const errs = checkScenario(
    { id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists: (p) => fileExists(p) && !p.endsWith('cleanup.ps1') }
  );
  assert.ok(errs.some((e) => e.includes('cleanup.powershell references missing file scripts/cleanup.ps1')));
});

test('paths must remain inside the scenario directory', () => {
  const manifest = {
    ...baseManifest,
    cleanup: { ...baseManifest.cleanup, bash: '../shared/cleanup.sh' },
    guide: '/repo/scenarios/disk-full/README.md',
  };

  const errs = checkScenario(
    { id: 'disk-full', manifest, dir: '/repo/scenarios/disk-full' },
    { fileExists }
  );

  assert.ok(errs.includes('guide must stay inside the scenario directory'));
  assert.ok(errs.includes('cleanup.bash must stay inside the scenario directory'));
});

test('optional remediate block may be omitted', () => {
  const manifest = { ...baseManifest };
  delete manifest.remediate;

  const errs = checkScenario(
    { id: 'disk-full', manifest, dir: '/x/disk-full' },
    { fileExists }
  );
  assert.deepEqual(errs, []);
});

test('non-executable .sh is reported', () => {
  const errs = checkScenario(
    { id: 'disk-full', manifest: baseManifest, dir: '/x/disk-full' },
    { fileExists, isExecutable: () => false }
  );
  assert.ok(errs.some((e) => e.includes('setup.bash scripts/setup.sh must be executable')));
});

test('findDuplicateActions returns sorted duplicate action names', () => {
  const manifest = {
    ...baseManifest,
    remediate: [
      { action: 'restart', bash: 'remediate/restart.sh', powershell: 'remediate/restart.ps1', description: 'Restart' },
      { action: 'cleanup', bash: 'remediate/cleanup.sh', powershell: 'remediate/cleanup.ps1', description: 'Cleanup' },
      { action: 'restart', bash: 'remediate/restart-2.sh', powershell: 'remediate/restart-2.ps1', description: 'Restart again' },
      { action: 'cleanup', bash: 'remediate/cleanup-2.sh', powershell: 'remediate/cleanup-2.ps1', description: 'Cleanup again' },
    ],
  };

  assert.deepEqual(findDuplicateActions(manifest), ['cleanup', 'restart']);
});
