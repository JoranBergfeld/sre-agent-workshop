import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const capsule = fileURLToPath(new URL('../', import.meta.url));
const subscription = 'fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77';

test('Windows Azure bridge requires explicit subscription and preserves native failures', async () => {
  const directory = path.join(capsule, '.test-runs', `bridge-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const run = (args, extra = {}) => spawnSync('pwsh', [
    '-NoProfile', '-File', path.join(capsule, 'scripts/azure-command.ps1'),
  ], {
    encoding: 'utf8',
    env: {
      ...process.env, FIXTURE_DIR: directory, ALCTX_AZURE_ARGS: JSON.stringify(args),
      PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`,
      ...extra,
    },
  });
  try {
    assert.notEqual(run(['group', 'exists', '--name', 'alctx-rg']).status, 0);
    const args = ['group', 'exists', '--name', 'alctx-rg', '--subscription', subscription, '--output', 'json'];
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'false');
    assert.equal(run(args, { FAIL_AZ: 'group exists' }).status, 19);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const shell of ['bash', 'pwsh']) {
  test(`${shell}: setup refuses implicit subscriptions before invoking Azure`, async () => {
    const extension = shell === 'bash' ? 'sh' : 'ps1';
    const args = shell === 'bash' ? [] : ['-NoProfile', '-File'];
    const result = spawnSync(shell, [...args, path.join(capsule, `scripts/setup.${extension}`)], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /explicit --subscription/);
  });

  test(`${shell}: provision, inject twice, preserve evidence and reset; scoped cleanup repeats safely`, async () => {
    const directory = path.join(capsule, '.test-runs', `${shell}-${process.pid}`);
    await mkdir(directory, { recursive: true });
    const env = {
      ...process.env, FIXTURE_DIR: directory,
      PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`,
    };
    const run = (operation, options = [], extra = {}) => {
      const extension = shell === 'bash' ? 'sh' : 'ps1';
      return spawnSync(shell, [
        ...(shell === 'bash' ? [] : ['-NoProfile', '-File']),
        path.join(capsule, `scripts/${operation}.${extension}`),
        '--state-dir', directory, ...options,
      ], { env: { ...env, ...extra }, encoding: 'utf8' });
    };
    const ok = result => assert.equal(result.status, 0, result.stderr + result.stdout);
    const remote = async () => JSON.parse(await readFile(path.join(directory, 'remote.json'), 'utf8'));
    try {
      ok(run('setup', ['--subscription', subscription]));
      assert.equal((await remote()).revision, 'healthy');
      await mkdir(path.join(directory, '.operation-lock'));
      assert.notEqual(run('inject').status, 0, 'concurrent operations must fail closed');
      await rm(path.join(directory, '.operation-lock'), { recursive: true });
      assert.notEqual(run('inject', ['--subscription', '00000000-0000-0000-0000-000000000000']).status, 0);
      ok(run('inject'));
      ok(run('inject'));
      assert.equal((await remote()).revision, 'faulty');
      ok(run('setup', ['--subscription', subscription]));
      assert.equal((await remote()).revision, 'faulty', 'repeated setup must not reset an incident');
      ok(run('evidence'));
      ok(run('validate', ['--expect', 'faulty']));
      assert.notEqual(run('validate', ['--expect', 'healthy']).status, 0);
      assert.notEqual(run('validate', [], { FAIL_HTTP: '1' }).status, 0);
      const before = (await remote()).deployments;
      assert.notEqual(run('reset', [], { FAIL_AZ: 'monitor log-analytics query' }).status, 0);
      assert.equal((await remote()).deployments, before, 'failed evidence export must prevent reset');
      ok(run('reset'));
      assert.equal((await remote()).revision, 'healthy');
      const { readdir } = await import('node:fs/promises');
      const evidence = await readdir(path.join(directory, 'evidence'));
      assert.ok(evidence.length >= 2);
      const contents = await Promise.all(evidence.map(file => readFile(path.join(directory, 'evidence', file), 'utf8')));
      assert.ok(contents.some(text => text.includes('preserved')));
      assert.notEqual(run('inject', [], { FAIL_AZ: 'webapp deploy' }).status, 0);
      assert.notEqual(run('deploy').status, 0);
      const source = path.join(directory, 'candidate-source');
      await cp(path.join(capsule, 'src'), source, { recursive: true });
      await writeFile(path.join(source, 'security-fixture.php'), '<?php // inert fixture must never ship');
      await writeFile(path.join(source, 'context.md'), 'not runtime');
      ok(run('deploy', ['--reviewed', 'yes', '--source-dir', source]));
      const archive = path.join(directory, 'uploaded.zip');
      const zipCheck = spawnSync('unzip', ['-t', archive], { encoding: 'utf8' });
      assert.equal(zipCheck.status, 0, zipCheck.stdout + zipCheck.stderr);
      const names = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).stdout.trim().split('\n');
      assert.deepEqual(names.sort(), ['deployment.json', 'index.php', 'nginx.conf', 'telemetry.php', 'timing.php']);
      const shared = await remote();
      shared.resources.push({ name: 'not-ours', tags: {} });
      await writeFile(path.join(directory, 'remote.json'), JSON.stringify(shared));
      assert.notEqual(run('cleanup').status, 0);
      assert.ok((await remote()).group, 'shared resource must prevent resource-group deletion');
      shared.resources.pop();
      shared.group.tags.owner = 'someone-else';
      await writeFile(path.join(directory, 'remote.json'), JSON.stringify(shared));
      assert.notEqual(run('inject').status, 0);
      assert.notEqual(run('setup', ['--subscription', subscription]).status, 0);
      assert.notEqual(run('cleanup').status, 0);
      const state = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
      shared.group.tags.owner = state.owner;
      await writeFile(path.join(directory, 'remote.json'), JSON.stringify(shared));
      ok(run('cleanup'));
      ok(run('cleanup'));
      assert.equal((await remote()).group, undefined);
      assert.deepEqual(await readdir(path.join(directory, 'evidence')).then(files => files.filter(file => evidence.includes(file))), evidence);
      ok(run('setup', ['--subscription', subscription]));
      assert.equal((await remote()).revision, 'healthy', 'recreated infrastructure must receive a package');
      ok(run('cleanup'));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test(`${shell}: failed partial setup remains cleanable; pre-existing unowned groups are never adopted`, async () => {
    const directory = path.join(capsule, '.test-runs', `partial-${shell}-${process.pid}`);
    await mkdir(directory, { recursive: true });
    const run = (operation, extra = {}) => spawnSync(shell, [
      ...(shell === 'bash' ? [] : ['-NoProfile', '-File']),
      path.join(capsule, `scripts/${operation}.${shell === 'bash' ? 'sh' : 'ps1'}`),
      '--state-dir', directory, '--subscription', subscription,
    ], {
      encoding: 'utf8',
      env: {
        ...process.env, FIXTURE_DIR: directory,
        PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`,
        ...extra,
      },
    });
    try {
      const file = path.join(directory, 'remote.json');
      await writeFile(file, JSON.stringify({ group: { name: 'alctx-rg', tags: {} } }));
      assert.notEqual(run('setup').status, 0);
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).group.tags, {});
      await writeFile(file, '{}');
      assert.notEqual(run('setup', { FAIL_AZ: 'deployment group create' }).status, 0);
      assert.ok(JSON.parse(await readFile(file, 'utf8')).group);
      const result = run('cleanup');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(await readFile(file, 'utf8')).group, undefined);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
