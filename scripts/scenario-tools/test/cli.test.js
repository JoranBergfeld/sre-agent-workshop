import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const toolsDir = resolve(import.meta.dirname, '..');
const validateJs = resolve(toolsDir, 'bin', 'validate.js');
const validateLegacyJs = resolve(toolsDir, 'bin', 'validate-legacy.js');
const wrapper = resolve(toolsDir, '..', 'validate-scenarios.sh');

test('direct validators emit success once and quiet-success suppresses it', () => {
  for (const script of [validateJs, validateLegacyJs]) {
    const normal = spawnSync('node', [script], { encoding: 'utf8' });
    assert.equal(normal.status, 0, normal.stderr);
    assert.equal(normal.stdout.trim(), 'Scenario validation passed');
    assert.equal(normal.stderr.trim(), '');

    const quiet = spawnSync('node', [script, '--quiet-success'], { encoding: 'utf8' });
    assert.equal(quiet.status, 0, quiet.stderr);
    assert.equal(quiet.stdout.trim(), '');
    assert.equal(quiet.stderr.trim(), '');
  }
});

test('wrapper prints a single success line after both validators complete', () => {
  const normal = spawnSync('bash', [wrapper], { encoding: 'utf8' });
  assert.equal(normal.status, 0, normal.stderr);
  assert.equal(normal.stdout.trim(), 'Scenario validation passed');
  assert.equal(normal.stderr.trim(), '');

  const written = spawnSync('bash', [wrapper, '--write'], { encoding: 'utf8' });
  assert.equal(written.status, 0, written.stderr);
  assert.equal((written.stdout.match(/Scenario validation passed/g) ?? []).length, 1);
  assert.ok(written.stdout.trim().endsWith('Scenario validation passed'));
  assert.equal(written.stderr.trim(), '');
});
