import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const scenarios = ['cosmos-rbac-removal', 'workload-identity-break'];
const mockedLifecyclePath = `${resolve(import.meta.dirname, 'fixtures', 'lifecycle-bin')}:${process.env.PATH}`;

test('AKS capsules use distinct default workload names', () => {
  const defaults = Object.fromEntries(scenarios.map((scenario) => {
    const mainBicep = readFileSync(resolve(
      repositoryRoot,
      'scenarios',
      scenario,
      'infra',
      'bicep',
      'main.bicep',
    ), 'utf8');
    const match = mainBicep.match(/param workloadName string = '([^']+)'/);

    assert.ok(match, `${scenario} must define a workloadName default`);
    return [scenario, match[1]];
  }));

  assert.equal(defaults['cosmos-rbac-removal'], 'srelabcosmos');
  assert.equal(defaults['workload-identity-break'], 'srelabidentity');
  assert.notEqual(
    defaults['cosmos-rbac-removal'],
    defaults['workload-identity-break'],
    'capsules must not share a default workload name',
  );
});

test('AKS capsules bind each federated identity to its own Kubernetes service account', () => {
  const expectedIdentities = {
    'cosmos-rbac-removal': {
      namespace: 'cosmos-rbac-removal',
      workloadName: 'cosmos-rbac-removal-app',
    },
    'workload-identity-break': {
      namespace: 'workload-identity-break',
      workloadName: 'workload-identity-break-app',
    },
  };
  const actualIdentities = Object.fromEntries(scenarios.map((scenario) => {
    const scenarioRoot = resolve(repositoryRoot, 'scenarios', scenario);
    const expected = expectedIdentities[scenario];
    const serviceAccount = readFileSync(resolve(scenarioRoot, 'k8s', 'service-account.yaml'), 'utf8');
    const deployment = readFileSync(resolve(scenarioRoot, 'k8s', 'deployment.yaml'), 'utf8');
    const service = readFileSync(resolve(scenarioRoot, 'k8s', 'service.yaml'), 'utf8');
    const identity = readFileSync(resolve(scenarioRoot, 'infra', 'bicep', 'modules', 'identity.bicep'), 'utf8');
    const serviceAccountName = serviceAccount.match(/metadata:\s+name: ([^\s]+)\s+namespace: ([^\s]+)/s);
    const identityNamespace = identity.match(/param k8sNamespace string = '([^']+)'/);
    const identityServiceAccount = identity.match(/param k8sServiceAccountName string = '([^']+)'/);

    assert.deepEqual(serviceAccountName?.slice(1), [expected.workloadName, expected.namespace]);
    assert.match(deployment, new RegExp(
      `metadata:\\s+name: ${expected.workloadName}\\s+namespace: ${expected.namespace}`,
      's',
    ));
    assert.match(deployment, new RegExp(`serviceAccountName: ${expected.workloadName}`));
    assert.match(service, new RegExp(
      `metadata:\\s+name: ${expected.workloadName}\\s+namespace: ${expected.namespace}`,
      's',
    ));
    assert.equal(identityNamespace?.[1], expected.namespace);
    assert.equal(identityServiceAccount?.[1], expected.workloadName);
    assert.match(
      identity,
      /subject: 'system:serviceaccount:\$\{k8sNamespace\}:\$\{k8sServiceAccountName\}'/,
    );

    return [scenario, `${identityNamespace?.[1]}/${identityServiceAccount?.[1]}`];
  }));

  assert.notEqual(
    actualIdentities['cosmos-rbac-removal'],
    actualIdentities['workload-identity-break'],
    'capsules must not share a Kubernetes identity',
  );
});

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
