import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..');
const workflowsRoot = resolve(repositoryRoot, '.github', 'workflows');

const capsuleWorkflows = {
  'arc-disk-pressure': {
    file: 'validate-arc-disk-pressure-capsule.yml',
    command: 'bash scenarios/arc-disk-pressure/tests/capsule.test.sh',
  },
  'cloud-agent-handover': {
    file: 'validate-appservice-app.yml',
    command: 'dotnet test scenarios/cloud-agent-handover/tests/HandoverApp.Tests.csproj',
  },
  'cpu-runaway': {
    file: 'validate-cpu-runaway-capsule.yml',
    command: 'bash scenarios/cpu-runaway/tests/test-capsule.sh',
  },
  'iis-app-pool': {
    file: 'validate-iis-app-pool-capsule.yml',
    command: 'find scenarios/iis-app-pool/tests -maxdepth 1 -type f -name',
  },
  'vm-size-retirement': {
    file: 'validate-vm-size-retirement-capsule.yml',
    command: 'node --test scenarios/vm-size-retirement/tests/capsule.test.js',
  },
};

const bicepWorkflows = {
  'arc-disk-pressure': {
    file: 'validate-arc-disk-pressure-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
  'cloud-agent-handover': {
    file: 'validate-appservice-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
  'cosmos-rbac-removal': {
    file: 'validate-cosmos-rbac-removal-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
  'cpu-runaway': {
    file: 'validate-cpu-runaway-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
  'iis-app-pool': {
    file: 'validate-iis-app-pool-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
  'vm-size-retirement': {
    file: 'validate-vm-size-retirement-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/service-health-alert.bicep'],
  },
  'workload-identity-break': {
    file: 'validate-workload-identity-break-infra.yml',
    artifacts: ['infra/bicep/main.bicep', 'infra/bicep/modules/alert.bicep'],
  },
};

function readWorkflow(file) {
  return readFileSync(resolve(workflowsRoot, file), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertPathScoped(content, scenarioId, workflowFile) {
  const scenarioPath = `'scenarios/${scenarioId}/`;
  const workflowPath = `'.github/workflows/${workflowFile}'`;

  assert.match(content, new RegExp(escapeRegExp(scenarioPath), 'g'));
  assert.match(content, new RegExp(escapeRegExp(workflowPath), 'g'));
  assert.doesNotMatch(content, /paths:\s*\n\s*-\s*['"]scenarios\/\*\*/);
}

for (const [scenarioId, workflow] of Object.entries(capsuleWorkflows)) {
  test(`${scenarioId} runs its declared capsule tests in isolated offline CI`, () => {
    const content = readWorkflow(workflow.file);

    assertPathScoped(content, scenarioId, workflow.file);
    assert.match(content, new RegExp(escapeRegExp(`'scenarios/${scenarioId}/**'`)));
    assert.match(content, new RegExp(escapeRegExp(workflow.command)));
    assert.match(content, new RegExp(`name: .*${scenarioId.replaceAll('-', ' ')}`, 'i'));
    assert.doesNotMatch(content, /azure\/login|az login|AZURE_CREDENTIALS/);
  });
}

test('IIS App Pool capsule validation fails when no executable tests are discovered', () => {
  const content = readWorkflow(capsuleWorkflows['iis-app-pool'].file);

  assert.match(content, /No executable capsule tests found/);
  assert.match(content, /exit 1/);
});

for (const [scenarioId, workflow] of Object.entries(bicepWorkflows)) {
  test(`${scenarioId} builds every centrally validated Bicep artifact in isolated CI`, () => {
    const content = readWorkflow(workflow.file);

    assertPathScoped(content, scenarioId, workflow.file);
    assert.match(content, new RegExp(`name: .*${scenarioId.replaceAll('-', ' ')}`, 'i'));

    for (const artifact of workflow.artifacts) {
      assert.match(
        content,
        new RegExp(
          escapeRegExp(`az bicep build --file scenarios/${scenarioId}/${artifact} --stdout`),
        ),
      );
    }
  });
}
