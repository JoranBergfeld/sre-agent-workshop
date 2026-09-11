import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflow = readFileSync(
  resolve(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'validate-scenarios.yml'),
  'utf8'
);

test('Validate Scenarios remains a structural-only repository gate', () => {
  assert.match(workflow, /npm test/);
  assert.match(workflow, /scripts\/validate-scenarios\.sh/);
  assert.doesNotMatch(workflow, /Run scenario capsule tests/);
  assert.doesNotMatch(workflow, /print-test-target\.js/);
  assert.doesNotMatch(workflow, /dotnet test/);
  assert.doesNotMatch(workflow, /az bicep build/);
});
