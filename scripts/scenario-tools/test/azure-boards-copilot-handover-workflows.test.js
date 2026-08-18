import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const workflowRoot = resolve(repositoryRoot, '.github', 'workflows');
const scenarioPath = 'scenarios/azure-boards-copilot-handover';
const qualityGuide = readFileSync(
  resolve(repositoryRoot, scenarioPath, 'CODE_QUALITY.md'),
  'utf8',
);

function readWorkflow(name) {
  const path = resolve(workflowRoot, name);
  assert.ok(existsSync(path), `missing workflow: ${name}`);
  return readFileSync(path, 'utf8');
}

test('Azure Boards handover application workflow runs every documented quality invariant', () => {
  const workflow = readWorkflow('validate-azure-boards-copilot-handover-app.yml');

  assert.match(workflow, /name: Validate Azure Boards Copilot Handover Application/);
  assert.match(workflow, new RegExp(`- '${scenarioPath}/app/\\*\\*'`));
  assert.match(workflow, new RegExp(`- '${scenarioPath}/CODE_QUALITY\\.md'`));
  assert.match(workflow, /python-version: '3\.12'/);
  assert.match(workflow, /pip install -r requirements-dev\.txt/);
  assert.match(workflow, /ruff format --check \./);
  assert.match(workflow, /ruff check \./);
  assert.match(workflow, /run: mypy/);
  assert.match(workflow, /pytest --cov=order_events --cov-report=term-missing/);
  assert.match(workflow, /pytest -m repair/);
  assert.match(workflow, /repair_status="\$\{PIPESTATUS\[0\]\}"/);
  assert.match(workflow, /\[\[ "\$repair_status" -ne 1 \]\]/);
  assert.match(workflow, /grep -cF "UnsupportedReceiptSchemaError: schemaVersion 'v2' is not supported"/);
  assert.match(workflow, /\[\[ "\$expected_failures" -ne 3 \]\]/);
  assert.match(
    workflow,
    /grep -Eq '\^=\+ 3 failed, \[0-9\]\+ deselected in \[0-9\.\]\+s =\+\$'/,
  );
});

test('Azure Boards handover infrastructure workflow validates the entry point and contract test', () => {
  const workflow = readWorkflow('validate-azure-boards-copilot-handover-infra.yml');

  assert.match(workflow, /name: Validate Azure Boards Copilot Handover Infrastructure/);
  assert.match(workflow, new RegExp(`- '${scenarioPath}/infra/\\*\\*'`));
  assert.match(
    workflow,
    new RegExp(
      `az bicep build --file\\s+${scenarioPath}/infra/bicep/main\\.bicep\\s+--stdout`,
    ),
  );
  assert.match(workflow, /bicep_cli="\$\{AZURE_CONFIG_DIR:-\$HOME\/\.azure\}\/bin\/bicep"/);
  assert.match(
    workflow,
    new RegExp(
      `test_file=${scenarioPath}/infra/bicep/tests/invalid-workload-name\\.test\\.bicep`,
    ),
  );
  assert.match(workflow, /"\$bicep_cli" test "\$test_file"/);
  assert.match(workflow, /test_status="\$\{PIPESTATUS\[0\]\}"/);
  assert.match(workflow, /\[\[ "\$test_status" -ne 1 \]\]/);
  assert.match(workflow, /grep -qF "Evaluation Summary: Failure!"/);
});

test('Azure Boards handover quality guide separates green gates from the expected-red invariant', () => {
  assert.match(qualityGuide, /## Green gates/);
  assert.match(qualityGuide, /## Expected-red starting-state invariant/);
  assert.match(qualityGuide, /repair_status="\$\{PIPESTATUS\[0\]\}"/);
  assert.match(qualityGuide, /\[\[ "\$repair_status" -ne 1 \]\]/);
  assert.match(qualityGuide, /\[\[ "\$expected_failures" -ne 3 \]\]/);
  assert.match(
    qualityGuide,
    /grep -Eq '\^=\+ 3 failed, \[0-9\]\+ deselected in \[0-9\.\]\+s =\+\$'/,
  );
  assert.match(qualityGuide, /The check succeeds only when all three repair tests fail/);
});
