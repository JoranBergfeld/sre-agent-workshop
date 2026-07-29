import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const capsuleRoot = resolve(import.meta.dirname, '..');

function capsulePath(...segments) {
  return resolve(capsuleRoot, ...segments);
}

function run(command, arguments_, env = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: capsuleRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  assert.ifError(result.error);
  return result;
}

test('PowerShell validation fails when the Azure inventory query fails', () => {
  const fixtureDirectory = capsulePath('tests/fixtures');
  const result = run(
    'pwsh',
    ['-NoProfile', '-File', capsulePath('scripts/validate.ps1')],
    { PATH: `${fixtureDirectory}:${process.env.PATH}` },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /az vm list failed/);
});

function collectScripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    return entry.isDirectory()
      ? collectScripts(entryPath)
      : entry.name.endsWith('.sh') || entry.name.endsWith('.ps1')
        ? [entryPath]
        : [];
  });
}

test('capsule manifest and assets use only local lifecycle and tool paths', () => {
  const requiredFiles = [
    'scenario.yaml',
    'README.md',
    'docs/00-prerequisites.md',
    'docs/01-deploy-infrastructure.md',
    'docs/02-configure-incident-response.md',
    'docs/90-watch-sre-agent.md',
    'docs/99-cleanup.md',
    'infra/bicep/main.bicep',
    'infra/bicep/main.bicepparam',
    'infra/bicep/modules/identity.bicep',
    'infra/bicep/modules/monitoring.bicep',
    'infra/bicep/modules/network.bicep',
    'infra/bicep/modules/vm.bicep',
    'infra/bicep/service-health-alert.bicep',
    'investigation/query.kql',
    'knowledge/operational-guidelines.md',
    'output/.gitkeep',
    'scripts/setup.sh',
    'scripts/setup.ps1',
    'scripts/inject.sh',
    'scripts/inject.ps1',
    'scripts/validate.sh',
    'scripts/validate.ps1',
    'scripts/cleanup.sh',
    'scripts/cleanup.ps1',
    'scripts/access/start-http-tunnel.sh',
    'scripts/access/start-http-tunnel.ps1',
    'scripts/access/start-rdp-tunnel.sh',
    'scripts/access/start-rdp-tunnel.ps1',
    'scripts/remediation/migrate-vm-size.sh',
    'scripts/remediation/migrate-vm-size.ps1',
    'scripts/tools/invoke-approved-remediation.sh',
    'scripts/tools/Invoke-ApprovedRemediation.ps1',
    'scripts/tools/invoke-vm-investigation.sh',
    'scripts/tools/Invoke-VmInvestigation.ps1',
    'scripts/tools/invoke-vm-run-command.sh',
    'scripts/tools/Invoke-VmRunCommand.ps1',
  ];

  for (const file of requiredFiles) {
    assert.ok(existsSync(capsulePath(file)), `missing capsule asset: ${file}`);
  }

  const manifest = readFileSync(capsulePath('scenario.yaml'), 'utf8');
  assert.match(manifest, /platform: Azure Virtual Machines/);
  assert.match(manifest, /incidentType: Platform lifecycle advisory/);
  assert.match(manifest, /costProfile: high/);
  assert.match(manifest, /guide: README\.md/);
  assert.match(manifest, /bash: scripts\/remediation\/migrate-vm-size\.sh/);
  assert.match(manifest, /powershell: scripts\/remediation\/migrate-vm-size\.ps1/);
  assert.doesNotMatch(manifest, /^\s*signal:/m);

  for (const script of collectScripts(capsulePath('scripts'))) {
    assert.doesNotMatch(
      readFileSync(script, 'utf8'),
      /workshops[\\/]vm/,
      `${script} must not reach into the legacy VM workshop`,
    );
  }
});

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/cleanup.sh'),
      '--yes',
      '--dry-run',
      '--resource-group',
      'rg-custom',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/cleanup.ps1'),
      '--yes',
      '--dry-run',
      '-ResourceGroup',
      'rg-custom',
    ],
  ],
]) {
  test(`${label} cleanup treats --yes as a boolean flag`, () => {
    const result = run(command, arguments_);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resource group: rg-custom/);
    assert.match(result.stdout, /Dry run: would delete resource group 'rg-custom'\./);
  });
}

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/tools/invoke-approved-remediation.sh'),
      '--action',
      'migrate-vm-size',
      '--change-ticket',
      'not-a-ticket',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
      '-Action',
      'migrate-vm-size',
      '-ChangeTicket',
      'not-a-ticket',
    ],
  ],
]) {
  test(`${label} approval gate rejects an invalid change ticket before remediation`, () => {
    const result = run(command, arguments_);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ChangeTicket must match CHG-12345 or INC-12345/);
  });
}
