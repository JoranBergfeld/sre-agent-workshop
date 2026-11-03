import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readZip } from '../../../scripts/build-artifacts/resolve.mjs';

const capsule = fileURLToPath(new URL('../', import.meta.url));
const subscription = 'fa68ebb3-c4c4-4b3f-8c91-cbef4c119d77';
const designatedGroup = () => ({
  group: { name: 'alctx-rg', location: 'westeurope', tags: { 'sre-workshop-scenario': 'appservice-latency-context' } },
});
const calls = async directory => (await readFile(path.join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);

test('Windows Azure bridge requires explicit subscription and preserves native failures', async () => {
  const directory = path.join(capsule, '.test-runs', `bridge-${process.pid}`);
  await mkdir(directory, { recursive: true });
  const run = (args, extra = {}) => spawnSync('pwsh', [
    '-NoProfile', '-File', path.join(capsule, 'scripts/azure-command.ps1'),
  ], {
    encoding: 'utf8', timeout: 30_000,
    env: {
      ...process.env, REAL_NODE: process.execPath, FIXTURE_DIR: directory, ALCTX_AZURE_ARGS: JSON.stringify(args),
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
      encoding: 'utf8', timeout: 30_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /explicit --subscription/);
  });

  test(`${shell}: provision, inject twice, preserve evidence and reset; scoped cleanup repeats safely`, async () => {
    const directory = path.join(capsule, '.test-runs', `${shell}-${process.pid}`);
    await mkdir(directory, { recursive: true });
    const env = {
      ...process.env, REAL_NODE: process.execPath, FIXTURE_DIR: directory,
      PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`,
    };
    const run = (operation, options = [], extra = {}) => {
      const extension = shell === 'bash' ? 'sh' : 'ps1';
      return spawnSync(shell, [
        ...(shell === 'bash' ? [] : ['-NoProfile', '-File']),
        path.join(capsule, `scripts/${operation}.${extension}`),
        '--state-dir', directory, ...options,
      ], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
    };
    const ok = result => assert.equal(result.status, 0, result.stderr + result.stdout);
    const remote = async () => JSON.parse(await readFile(path.join(directory, 'remote.json'), 'utf8'));
    try {
      await writeFile(path.join(directory, 'remote.json'), JSON.stringify(designatedGroup()));
      ok(run('setup', ['--subscription', subscription]));
      assert.equal((await remote()).revision, 'healthy');
      const setupCalls = await calls(directory);
      const checkIndex = setupCalls.findIndex(call => call[0] === 'placement' && call[1] === 'check');
      const resolveIndex = setupCalls.findIndex(call => call[0] === 'resolve');
      const registerIndex = setupCalls.findIndex(call => call[0] === 'az' && call[1] === 'provider' && call[2] === 'register');
      const provisionIndex = setupCalls.findIndex(call => call[0] === 'placement' && call[1] === 'deploy');
      assert.ok(checkIndex >= 0 && checkIndex < resolveIndex && resolveIndex < registerIndex && registerIndex < provisionIndex);
      assert.ok(setupCalls[checkIndex].includes('--require-group'));
      assert.ok(setupCalls[provisionIndex].includes('--outputs-file'));
      assert.ok(!setupCalls[resolveIndex].includes('--repo'));
      assert.ok(!setupCalls.some(call => call[0] === 'az' && call[1] === 'group' && call[2] === 'create'));
      await mkdir(path.join(directory, '.operation-lock'));
      assert.notEqual(run('inject').status, 0, 'concurrent operations must fail closed');
      await rm(path.join(directory, '.operation-lock'), { recursive: true });
      assert.notEqual(run('inject', ['--subscription', '00000000-0000-0000-0000-000000000000']).status, 0);
      ok(run('inject'));
      ok(run('inject'));
      assert.equal((await remote()).revision, 'faulty');
      ok(run('setup', ['--subscription', subscription]));
      assert.equal((await remote()).revision, 'faulty', 'repeated setup must not reset an incident');
      assert.match((await remote()).appSettings.WEBSITE_RUN_FROM_PACKAGE, /sig=SECRET/);
      assert.doesNotMatch(await readFile(path.join(directory, 'state.json'), 'utf8'), /SECRET/);
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
      ok(run('deploy'));
      assert.equal((await remote()).revision, 'healthy');
      ok(run('deploy', ['--variant', 'faulty']));
      assert.equal((await remote()).revision, 'faulty');
      ok(run('reset', ['--local-build'], { FAIL_RESOLVE: '1' }));
      ok(run('deploy', ['--local-build', '--variant', 'faulty'], { FAIL_RESOLVE: '1' }));
      const source = path.join(directory, 'candidate-source');
      await cp(path.join(capsule, 'src'), source, { recursive: true });
      await writeFile(path.join(source, 'security-fixture.php'), '<?php // inert fixture must never ship');
      await writeFile(path.join(source, 'context.md'), 'not runtime');
      const beforeUnconfirmedReview = (await remote()).deployments;
      assert.notEqual(run('deploy', ['--source-dir', source]).status, 0,
        'reviewed source must require explicit human confirmation');
      assert.notEqual(run('deploy', ['--reviewed', 'no']).status, 0,
        'a negative review confirmation must fail closed');
      assert.notEqual(run('deploy', ['--reviewed', 'yes', '--variant', 'faulty']).status, 0,
        'reviewed source must not be confused with an incident variant');
      assert.equal((await remote()).deployments, beforeUnconfirmedReview);
      ok(run('deploy', ['--reviewed', 'yes', '--source-dir', source]));
      const archive = path.join(directory, 'uploaded.zip');
      const localEntries = readZip(await readFile(archive));
      assert.deepEqual([...localEntries.keys()].sort(),
        ['deployment.json', 'index.php', 'nginx.conf', 'telemetry.php', 'timing.php']);
      assert.equal(JSON.parse(localEntries.get('deployment.json').toString('utf8')).revision,
        'reviewed-source', 'explicit --source-dir remains a local reviewed-source package');
      assert.equal(JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8')).artifact.source, 'local');
      await writeFile(path.join(directory, 'calls.jsonl'), '');
      const beforeMissingReviewedArtifact = (await remote()).deployments;
      const missingReviewed = run('deploy', ['--reviewed', 'yes'], { FAIL_RESOLVE: '1' });
      assert.notEqual(missingReviewed.status, 0);
      assert.equal((await remote()).deployments, beforeMissingReviewedArtifact,
        'missing reviewed artifact must prevent deployment');
      const missingCalls = await calls(directory);
      const missingCheckIndex = missingCalls.findIndex(call => call[0] === 'placement' && call[1] === 'check');
      const missingResolveIndex = missingCalls.findIndex(call => call[0] === 'resolve');
      assert.ok(missingCheckIndex >= 0 && missingCheckIndex < missingResolveIndex);
      assert.ok(!missingCalls.some(call => call[0] === 'az' && call[1] === 'webapp' && call[2] === 'deploy'));
      await writeFile(path.join(directory, 'calls.jsonl'), '');
      ok(run('deploy', ['--reviewed', 'yes']));
      assert.equal((await remote()).revision, 'reviewed');
      const reviewedCalls = await calls(directory);
      const reviewedCheckIndex = reviewedCalls.findIndex(call => call[0] === 'placement' && call[1] === 'check');
      const reviewedResolveIndex = reviewedCalls.findIndex(call => call[0] === 'resolve');
      assert.ok(reviewedCheckIndex >= 0 && reviewedCheckIndex < reviewedResolveIndex);
      assert.deepEqual(reviewedCalls[reviewedResolveIndex].slice(1), [
        '--scenario', 'appservice-latency-context', '--variant', 'reviewed-source',
        '--output-dir', directory,
      ]);
      const reviewedState = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
      assert.equal(reviewedState.revision, 'reviewed');
      assert.deepEqual(reviewedState.artifact, { sourceSha: 'a'.repeat(40), variant: 'reviewed-source' });
      const artifactEntries = readZip(await readFile(path.join(directory, 'uploaded.zip')));
      assert.equal(JSON.parse(artifactEntries.get('deployment.json').toString('utf8')).revision, 'reviewed-source');
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
      assert.notEqual(run('setup', ['--subscription', subscription]).status, 0, 'setup never recreates missing groups');
      await writeFile(path.join(directory, 'remote.json'), JSON.stringify(designatedGroup()));
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
      encoding: 'utf8', timeout: 60_000,
      env: {
        ...process.env, REAL_NODE: process.execPath, FIXTURE_DIR: directory,
        PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`,
        ...extra,
      },
    });
    try {
      const file = path.join(directory, 'remote.json');
      await writeFile(file, JSON.stringify({ group: { name: 'alctx-rg', tags: {} } }));
      assert.notEqual(run('setup').status, 0);
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).group.tags, {});
      await writeFile(file, JSON.stringify(designatedGroup()));
      assert.notEqual(run('setup', { FAIL_AZ: 'deployment group create' }).status, 0);
      assert.ok(JSON.parse(await readFile(file, 'utf8')).group);
      const result = run('cleanup');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(await readFile(file, 'utf8')).group, undefined);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test(`${shell}: ownership and exact-commit artifact failures precede every mutation; local build is explicit`, async () => {
    const directory = path.join(capsule, '.test-runs', `gates-${shell}-${process.pid}`);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, 'remote.json');
    const run = (options = [], extra = {}) => spawnSync(shell, [
      ...(shell === 'bash' ? [] : ['-NoProfile', '-File']),
      path.join(capsule, `scripts/setup.${shell === 'bash' ? 'sh' : 'ps1'}`),
      '--state-dir', directory, '--subscription', subscription, ...options,
    ], {
      encoding: 'utf8', timeout: 60_000,
      env: {
        ...process.env, REAL_NODE: process.execPath, FIXTURE_DIR: directory,
        PATH: `${path.join(capsule, 'tests/fixtures/bin')}${path.delimiter}${process.env.PATH}`, ...extra,
      },
    });
    try {
      assert.notEqual(run().status, 0, 'missing group must not be created');
      assert.ok(!(await calls(directory)).some(call => call[0] === 'resolve'));
      await writeFile(file, JSON.stringify(designatedGroup()));
      await writeFile(path.join(directory, 'calls.jsonl'), '');
      const failed = run([], { FAIL_RESOLVE: '1' });
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /exact-commit build|exact-source build/);
      const failedCalls = await calls(directory);
      assert.ok(failedCalls.some(call => call[0] === 'resolve'));
      assert.ok(failedCalls.filter(call => call[0] === 'az')
        .every(call => !['register', 'update', 'create', 'deploy', 'delete'].includes(call[2])));
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), designatedGroup());
      const local = run(['--local-build'], { FAIL_RESOLVE: '1', NO_WEST_EUROPE: '1' });
      assert.equal(local.status, 0, local.stderr);
      const remote = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(remote.resources[0].location, 'swedencentral');
      assert.equal(remote.revision, 'healthy');
      assert.doesNotMatch(local.stdout + local.stderr, /SECRET/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('latency Bicep merges existing dynamic app settings outside the site configuration', async () => {
  const bicep = await readFile(path.join(capsule, 'infra/bicep/main.bicep'), 'utf8');
  assert.doesNotMatch(bicep, /appSettings:\s*\[/);
  assert.match(bicep, /properties: union\(list\('\$\{app.id\}\/config\/appsettings'/);
});
