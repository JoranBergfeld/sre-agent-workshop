import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const toolsDir = resolve(import.meta.dirname, '..');
const validateJs = resolve(toolsDir, 'bin', 'validate.js');
const validateLegacyJs = resolve(toolsDir, 'bin', 'validate-legacy.js');
const wrapper = resolve(toolsDir, '..', 'validate-scenarios.sh');
const scenariosDir = resolve(toolsDir, '..', '..', 'scenarios');

function makeTempCapsuleDir() {
  const dir = resolve(scenariosDir, `temp-capsule-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

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

test('validate.js fails on a manifest-less top-level scenario directory', (t) => {
  const dir = makeTempCapsuleDir();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const result = spawnSync('node', [validateJs], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`✖ ${dir.split('/').pop()}: missing required file scenario\\.yaml`));
});

test('validate.js reports invalid scenario.yaml content precisely', (t) => {
  const dir = makeTempCapsuleDir();
  writeFileSync(resolve(dir, 'scenario.yaml'), 'id: [broken\n');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const result = spawnSync('node', [validateJs], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`✖ ${dir.split('/').pop()}: invalid scenario\\.yaml:`));
});
