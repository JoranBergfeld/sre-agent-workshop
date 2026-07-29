import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const scenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const mockedLifecyclePath = `${resolve(import.meta.dirname, 'fixtures', 'lifecycle-bin')}:${process.env.PATH}`;

for (const scenario of scenarios) {
  const scriptsDirectory = resolve(repositoryRoot, 'scenarios', scenario, 'scripts');

  test(`${scenario} Bash cleanup keeps --yes out of the resource group`, () => {
    const result = spawnSync('bash', [
      resolve(scriptsDirectory, 'cleanup.sh'),
      '--yes',
      '--dry-run',
      '--resource-group',
      'rg-custom',
    ], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resource group: rg-custom/);
    assert.match(result.stdout, /Dry run: would delete resource group 'rg-custom'\./);
  });

  test(`${scenario} PowerShell cleanup keeps --yes out of the resource group`, () => {
    const result = spawnSync('pwsh', [
      '-NoProfile',
      '-File',
      resolve(scriptsDirectory, 'cleanup.ps1'),
      '--yes',
      '--dry-run',
      '-ResourceGroup',
      'rg-custom',
    ], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resource group: rg-custom/);
    assert.match(result.stdout, /Dry run: would delete resource group 'rg-custom'\./);
  });
}

test('Cosmos RBAC manual fallback does not create an existing matching assignment', () => {
  const scriptsDirectory = resolve(repositoryRoot, 'scenarios', 'cosmos-rbac-removal', 'scripts');

  const commands = [
    ['bash', [resolve(scriptsDirectory, 'remediate.sh')]],
    ['pwsh', ['-NoProfile', '-File', resolve(scriptsDirectory, 'remediate.ps1')]],
  ];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: { ...process.env, PATH: mockedLifecyclePath },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already exists.*No changes made\./);
  }
});

test('Cosmos RBAC manual fallback stops when listing role assignments fails', () => {
  const scriptsDirectory = resolve(repositoryRoot, 'scenarios', 'cosmos-rbac-removal', 'scripts');

  const commands = [
    ['bash', [resolve(scriptsDirectory, 'remediate.sh')]],
    ['pwsh', ['-NoProfile', '-File', resolve(scriptsDirectory, 'remediate.ps1')]],
  ];

  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: mockedLifecyclePath,
        LIFECYCLE_AZ_FAIL_ROLE_ASSIGNMENT_LIST: '1',
      },
    });

    assert.notEqual(result.status, 0, result.stderr);
    assert.match(result.stderr, /simulated role-assignment list failure/);
    assert.doesNotMatch(result.stderr, /unexpected CosmosDB role assignment creation/);
  }
});
