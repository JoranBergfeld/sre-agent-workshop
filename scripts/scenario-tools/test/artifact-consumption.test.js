import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { main, readZip, resolveArtifact } from '../../build-artifacts/resolve.mjs';

const resolver = fileURLToPath(new URL('../../build-artifacts/resolve.mjs', import.meta.url));
const sha = 'a'.repeat(40);
const repository = 'Learner/Workshop';
const workflows = {
  'cloud-agent-handover': ['validate-appservice-app.yml', 'dotnet-10-linux-x64'],
  'azure-boards-copilot-handover': ['validate-azure-boards-copilot-handover-app.yml', 'python-3.12-linux-x64'],
  'appservice-latency-context': ['build-appservice-latency-context.yml', 'php-8.3-linux'],
  'cosmos-rbac-removal': ['publish-cosmos-rbac-removal-image.yml', 'linux/amd64'],
  'workload-identity-break': ['publish-workload-identity-break-image.yml', 'linux/amd64'],
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries, compressed = false) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [filename, value] of entries) {
    const body = Buffer.from(value);
    const name = Buffer.from(filename);
    const payload = compressed ? deflateRawSync(body) : body;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc32(body), 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(20, 4);
    local.copy(record, 6, 4, 30);
    record.writeUInt32LE(offset, 42);
    chunks.push(local, name, payload);
    central.push(record, name);
    offset += local.length + name.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

async function fixture(t, scenario = 'cloud-agent-handover', variant = 'application') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sre-artifact-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workflow = workflows[scenario][0];
  const image = scenario === 'cosmos-rbac-removal' || scenario === 'workload-identity-break';
  const deploymentEntries = scenario === 'cloud-agent-handover'
    ? ['HandoverApp.dll', 'HandoverApp.deps.json', 'HandoverApp.runtimeconfig.json', 'wwwroot/site.css']
    : scenario === 'azure-boards-copilot-handover'
      ? ['host.json', 'function_app.py', 'requirements.txt', 'order_events/__init__.py',
        '.python_packages/lib/site-packages/azure/functions/__init__.py']
      : ['index.php', 'timing.php', 'telemetry.php', 'nginx.conf'];
  const entries = deploymentEntries.map(name => [name, `fixture ${name}`]);
  if (scenario === 'appservice-latency-context') entries.push(['deployment.json', JSON.stringify({
    revision: { healthy: 'baseline-v1', faulty: 'candidate-v2', 'reviewed-source': 'reviewed-source' }[variant],
  })]);
  const deployment = zip(entries, true);
  const build = {
    id: 123, workflow_id: 7, path: `.github/workflows/${workflow}`,
    repository: { full_name: repository }, head_repository: { full_name: repository },
    head_sha: sha, event: 'push', status: 'completed', conclusion: 'success',
    run_attempt: 2, head_branch: 'main',
  };
  const metadata = {
    schemaVersion: 1, repository, scenario, variant, sourceSha: sha,
    runtime: workflows[scenario][1],
    files: image ? [] : [{
      path: 'deployment.zip', size: deployment.length,
      sha256: createHash('sha256').update(deployment).digest('hex'),
    }],
    build: { runId: '123', runAttempt: '2', event: 'push', ref: 'refs/heads/main' },
  };
  if (image) metadata.image = {
    digest: `sha256:${'b'.repeat(64)}`,
    reference: `ghcr.io/learner/workshop/${scenario}/app@sha256:${'b'.repeat(64)}`,
  };
  const state = {
    directory, deployment, metadata, build, candidate: structuredClone(build),
    workflow: { id: 7, path: build.path, state: 'active' },
    repo: { nameWithOwner: repository, url: 'https://github.com/Learner/Workshop' },
    artifact: {
      id: 91, name: `${scenario}-${variant}-${sha}`, expired: false,
      workflow_run: { id: 123, head_sha: sha },
    },
    dirty: '', branch: 'main', tags: '', sha, remote: 'git@github.com:Learner/Workshop.git', extra: [], calls: [],
    options: { scenario, variant, outputDir: path.join(directory, 'output') },
  };
  state.archive = () => zip([
    ['metadata.json', JSON.stringify(state.metadata)],
    ...(image ? [] : [['deployment.zip', state.deployment]]), ...state.extra,
  ], true);
  state.run = (command, args, settings) => {
    state.calls.push({ command, args, settings });
    if (state.failure) throw new Error(state.failure);
    if (command === 'git') {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return directory;
      if (args[0] === 'rev-parse') return state.sha;
      if (args[0] === 'status') return state.dirty;
      if (args[0] === 'remote') return state.remote;
      if (args[0] === 'branch') return state.branch;
      if (args[0] === 'tag') return state.tags;
    }
    if (command === 'gh') {
      if (args[0] === 'repo') return JSON.stringify(state.repo);
      const endpoint = args.at(-1);
      if (endpoint.endsWith(`/workflows/${workflow}`)) return JSON.stringify(state.workflow);
      if (endpoint.includes('/workflows/7/runs?')) return JSON.stringify(state.pages ?? [{ workflow_runs: [state.candidate] }]);
      if (endpoint.endsWith('/runs/123')) return JSON.stringify(state.build);
      if (endpoint.includes('/runs/123/artifacts?')) return JSON.stringify(state.artifactPages ?? [{ artifacts: [state.artifact] }]);
      if (endpoint.endsWith('/artifacts/91/zip')) return state.archive();
    }
    throw new Error(`Unexpected mock command: ${command} ${args.join(' ')}`);
  };
  state.resolve = () => resolveArtifact(state.options, { run: state.run, cwd: directory });
  return state;
}

for (const scenario of Object.keys(workflows)) {
  const variants = scenario === 'appservice-latency-context' ? ['healthy', 'faulty', 'reviewed-source'] : ['application'];
  for (const variant of variants) {
    test(`${scenario}/${variant}: resolves exact-source ${scenario.includes('identity') || scenario.includes('cosmos') ? 'image' : 'ZIP'}`, async t => {
      const f = await fixture(t, scenario, variant);
      const result = await main([
        '--scenario', scenario, '--variant', variant, '--output-dir', f.options.outputDir,
        '--repo', repository,
      ], { run: f.run, cwd: f.directory });
      assert.equal(result.scenario, scenario);
      assert.equal(result.variant, variant);
      assert.equal(result.sourceSha, sha);
      if (f.metadata.image) {
        assert.equal(result.imageReference, f.metadata.image.reference);
        assert.equal(result.deploymentZip, undefined);
      } else {
        assert.ok(path.isAbsolute(result.deploymentZip));
        assert.deepEqual(await readFile(result.deploymentZip), f.deployment);
        assert.equal(result.imageReference, undefined);
      }
      const download = f.calls.filter(call => call.args.at(-1)?.endsWith('/zip'));
      assert.equal(download.length, 1);
      assert.ok(download[0].args.at(-1).includes('/artifacts/91/'));
      const status = f.calls.find(call => call.args[0] === 'status');
      assert.ok(status.args.includes('--untracked-files=all'));
      assert.ok(status.args.includes(`.github/workflows/${workflows[scenario][0]}`));
      assert.ok(status.args.includes('scripts/build-artifacts'));
    });
  }
}

for (const [name, mutate, message] of [
  ['wrong workflow ID', f => { f.build.workflow_id = 8; }, /Untrusted GitHub run/],
  ['wrong workflow path', f => { f.build.path = '.github/workflows/evil.yml'; }, /Untrusted GitHub run/],
  ['wrong run repository', f => { f.build.repository.full_name = 'Other/Workshop'; }, /Untrusted GitHub run/],
  ['wrong head repository', f => { f.build.head_repository.full_name = 'Other/Workshop'; }, /Untrusted GitHub run/],
  ['PR event', f => { f.build.event = 'pull_request'; }, /Untrusted GitHub run/],
  ['PR target event', f => { f.build.event = 'pull_request_target'; }, /Untrusted GitHub run/],
  ['wrong run SHA', f => { f.build.head_sha = 'c'.repeat(40); }, /Untrusted GitHub run/],
  ['failed detailed run', f => { f.build.conclusion = 'failure'; }, /Untrusted GitHub run/],
  ['changed run attempt', f => { f.build.run_attempt = 3; }, /changed during resolution/],
  ['wrong list candidate', f => { f.candidate.head_repository.full_name = 'Other/Workshop'; }, /Untrusted GitHub run/],
  ['wrong workflow API path', f => { f.workflow.path = '.github/workflows/evil.yml'; }, /workflow identity/],
  ['inactive workflow', f => { f.workflow.state = 'disabled_manually'; }, /workflow identity/],
  ['malformed run list', f => { f.pages = [{ wrong: [] }]; }, /Malformed workflow runs/],
  ['null workflow API response', f => { f.workflow = null; }, /workflow identity/],
  ['null run list page', f => { f.pages = [null]; }, /Malformed workflow runs/],
  ['null run candidate', f => { f.pages = [{ workflow_runs: [null] }]; }, /Malformed workflow run/],
  ['malformed artifact list', f => { f.artifactPages = [{}]; }, /Malformed artifact list/],
  ['null artifact', f => { f.artifactPages = [{ artifacts: [null] }]; }, /Malformed artifact list/],
  ['artifact wrong run', f => { f.artifact.workflow_run.id = 234; }, /Artifact API source/],
  ['artifact wrong SHA', f => { f.artifact.workflow_run.head_sha = 'd'.repeat(40); }, /Artifact API source/],
  ['artifact missing expired flag', f => { delete f.artifact.expired; }, /Artifact API source/],
  ['wrong downloaded digest', f => { f.artifact.digest = `sha256:${'0'.repeat(64)}`; }, /artifact digest mismatch/],
  ['metadata wrong repo', f => { f.metadata.repository = 'Other/Workshop'; }, /metadata binding/],
  ['metadata wrong schema', f => { f.metadata.schemaVersion = 2; }, /metadata binding/],
  ['metadata numeric run ID', f => { f.metadata.build.runId = 123; }, /metadata binding/],
  ['metadata wrong scenario', f => { f.metadata.scenario = 'cosmos-rbac-removal'; }, /metadata binding/],
  ['metadata wrong SHA', f => { f.metadata.sourceSha = 'c'.repeat(40); }, /metadata binding/],
  ['metadata wrong variant', f => { f.metadata.variant = 'faulty'; }, /metadata binding/],
  ['metadata wrong runtime', f => { f.metadata.runtime = 'windows'; }, /metadata binding/],
  ['metadata wrong run ID', f => { f.metadata.build.runId = '234'; }, /metadata binding/],
  ['metadata wrong attempt', f => { f.metadata.build.runAttempt = '1'; }, /metadata binding/],
  ['metadata wrong event', f => { f.metadata.build.event = 'workflow_dispatch'; }, /metadata binding/],
  ['metadata wrong ref', f => { f.metadata.build.ref = 'refs/heads/other'; }, /metadata binding/],
  ['wrong checksum', f => { f.metadata.files[0].sha256 = 'f'.repeat(64); }, /checksum/],
  ['wrong size', f => { f.metadata.files[0].size++; }, /checksum/],
  ['duplicate file declaration', f => { f.metadata.files.push(f.metadata.files[0]); }, /checksum/],
  ['wrong ZIP filename', f => { f.metadata.files[0].path = 'other.zip'; }, /checksum/],
  ['unexpected file', f => { f.extra.push(['extra.txt', 'untrusted']); }, /artifact layout/],
  ['nested layout', f => { f.extra.push(['nested/metadata.json', '{}']); }, /artifact layout/],
  ['unsafe path', f => { f.extra.push(['../escape.txt', 'untrusted']); }, /Unsafe/],
  ['duplicate metadata', f => { f.extra.push(['metadata.json', '{}']); }, /duplicate/],
  ['malformed repository JSON', f => { f.repo = null; }, /Malformed repository/],
  ['repository URL mismatch', f => { f.repo.url = 'https://github.com/Other/Workshop'; }, /URL identity/],
  ['wrong discovered repository', f => { f.repo.nameWithOwner = 'Other/Workshop'; }, /repository identity mismatch/],
  ['wrong origin host', f => { f.repo.url = 'https://other.example/Learner/Workshop'; }, /host mismatch/],
  ['local-only remote', f => { f.remote = '/tmp/not-github'; }, /provide --repo/],
  ['invalid Git SHA', f => { f.sha = 'main'; }, /full commit SHA/],
  ['dirty tracked source', f => { f.dirty = ' M scenarios/cloud-agent-handover/src/Program.cs\0'; }, /Dirty deployable source/],
  ['dirty untracked source', f => { f.dirty = '?? scenarios/cloud-agent-handover/src/New.cs\0'; }, /Dirty deployable source/],
]) {
  test(`rejects ${name} without creating deployment output`, async t => {
    const f = await fixture(t);
    mutate(f);
    await assert.rejects(f.resolve, message);
    await assert.rejects(readdir(f.options.outputDir), { code: 'ENOENT' });
  });
}

for (const reason of ['missing', 'expired', 'failed', 'other-name']) {
  test(`${reason} build gives branch dispatch guidance, never a SHA fallback`, async t => {
    const f = await fixture(t);
    if (reason === 'missing') f.pages = [{ workflow_runs: [] }];
    if (reason === 'expired') f.artifact.expired = true;
    if (reason === 'failed') f.candidate.conclusion = 'failure';
    if (reason === 'other-name') f.artifact.name = `cloud-agent-handover-application-${'b'.repeat(40)}`;
    await assert.rejects(f.resolve, error => {
      assert.match(error.message, /No successful, unexpired exact-source build/);
      assert.match(error.message, /gh workflow run validate-appservice-app.yml --repo Learner\/Workshop --ref "main"/);
      assert.doesNotMatch(error.message, new RegExp(`--ref ["']?${sha}`));
      return true;
    });
    assert.equal(f.calls.filter(call => call.args.at(-1)?.endsWith('/zip')).length, 0);
  });
}

test('detached HEAD uses a pointing tag or explains the required branch/tag', async t => {
  const f = await fixture(t);
  f.pages = [{ workflow_runs: [] }];
  f.branch = '';
  await assert.rejects(f.resolve, /Detached HEAD.*--ref cannot be a raw commit SHA/);
  f.tags = 'workshop-v1';
  await assert.rejects(f.resolve, /--ref "workshop-v1"/);
});

test('dispatch tag metadata is accepted only with the same API head ref', async t => {
  const f = await fixture(t);
  for (const build of [f.build, f.candidate]) {
    build.event = 'workflow_dispatch';
    build.head_branch = 'workshop-v1';
  }
  f.metadata.build.event = 'workflow_dispatch';
  f.metadata.build.ref = 'refs/tags/workshop-v1';
  assert.equal((await f.resolve()).sourceSha, sha);
});

test('pagination and the Actions ZIP digest are independently checked', async t => {
  const f = await fixture(t);
  f.pages = [{ workflow_runs: [] }, { workflow_runs: [f.candidate] }];
  f.artifactPages = [{ artifacts: [] }, { artifacts: [f.artifact] }];
  f.artifact.digest = `sha256:${createHash('sha256').update(f.archive()).digest('hex')}`;
  assert.equal((await f.resolve()).sourceSha, sha);
  assert.ok(f.calls.filter(call => call.args.includes('--paginate')).length >= 2);
});

test('PR runs for the same SHA are ignored in favor of a trusted successful push', async t => {
  const f = await fixture(t);
  f.pages = [{ workflow_runs: [{ ...f.candidate, id: 456, event: 'pull_request' }, f.candidate] }];
  assert.equal((await f.resolve()).sourceSha, sha);
  assert.equal(f.calls.filter(call => call.args.at(-1)?.endsWith('/runs/456')).length, 0);
});

for (const remote of ['https://github.com/Learner/Workshop.git', 'ssh://git@github.com/Learner/Workshop.git']) {
  test(`repository discovery binds origin ${remote}`, async t => {
    const f = await fixture(t);
    f.remote = remote;
    await f.resolve();
    assert.ok(f.calls.some(call => call.command === 'gh'
      && call.args[0] === 'repo' && call.args[2] === 'github.com/Learner/Workshop'));
  });
}

test('explicit repository works without a discoverable origin', async t => {
  const f = await fixture(t);
  f.remote = '/tmp/not-github';
  f.options.repo = repository;
  assert.equal((await f.resolve()).sourceSha, sha);
  assert.equal(f.calls.filter(call => call.args[0] === 'remote').length, 0);
});

test('invocation below the repository root still checks root-relative deployable source', async t => {
  const f = await fixture(t);
  const cwd = path.join(f.directory, 'scenarios', 'cloud-agent-handover');
  f.options.outputDir = '../downloads';
  const result = await resolveArtifact(f.options, { run: f.run, cwd });
  assert.ok(result.deploymentZip.startsWith(path.resolve(cwd, '../downloads') + path.sep));
  const statuses = f.calls.filter(call => call.args[0] === 'status');
  assert.equal(statuses.length, 2);
  assert.ok(statuses.every(call => call.settings.cwd === f.directory));
});

test('ambiguous exact-name artifact IDs are rejected', async t => {
  const f = await fixture(t);
  f.artifactPages = [{ artifacts: [f.artifact, { ...f.artifact, id: 92 }] }];
  await assert.rejects(f.resolve, /Ambiguous/);
});

test('invalid deployment root is rejected even with a correct checksum', async t => {
  const f = await fixture(t);
  f.deployment = zip([['publish/HandoverApp.dll', 'fixture']]);
  f.metadata.files[0].sha256 = createHash('sha256').update(f.deployment).digest('hex');
  f.metadata.files[0].size = f.deployment.length;
  await assert.rejects(f.resolve, /ZIP root layout/);
});

test('malformed artifact metadata JSON is rejected explicitly', async t => {
  const f = await fixture(t);
  f.archive = () => zip([['metadata.json', '{'], ['deployment.zip', f.deployment]]);
  await assert.rejects(f.resolve, /Malformed artifact metadata JSON/);
});

test('malformed GitHub response JSON is rejected explicitly', async t => {
  const f = await fixture(t);
  const run = f.run;
  const malformed = (command, args, settings) =>
    command === 'gh' && args[0] === 'api' ? '{' : run(command, args, settings);
  await assert.rejects(resolveArtifact(f.options, { run: malformed, cwd: f.directory }), /Malformed GitHub API JSON/);
});

test('reviewed-source rejects non-main provenance', async t => {
  const f = await fixture(t, 'appservice-latency-context', 'reviewed-source');
  f.build.head_branch = f.candidate.head_branch = 'candidate';
  f.metadata.build.ref = 'refs/heads/candidate';
  await assert.rejects(f.resolve, /must come from main/);
});

test('latency inner variant must match outer variant binding', async t => {
  const f = await fixture(t, 'appservice-latency-context', 'faulty');
  const entries = [...readZip(f.deployment)].map(([name, body]) =>
    [name, name === 'deployment.json' ? JSON.stringify({ revision: 'baseline-v1' }) : body]);
  f.deployment = zip(entries);
  f.metadata.files[0].sha256 = createHash('sha256').update(f.deployment).digest('hex');
  f.metadata.files[0].size = f.deployment.length;
  await assert.rejects(f.resolve, /variant mismatch/);
});

for (const [label, mutate] of [
  ['mutable tag', f => { f.metadata.image.reference = 'ghcr.io/learner/workshop/cosmos-rbac-removal/app:latest'; }],
  ['short digest', f => { f.metadata.image.digest = 'sha256:abc'; }],
  ['different image repository', f => { f.metadata.image.reference = f.metadata.image.reference.replace('learner', 'other'); }],
  ['different reference digest', f => { f.metadata.image.reference = f.metadata.image.reference.replaceAll('b'.repeat(64), 'c'.repeat(64)); }],
]) {
  test(`image rejects ${label}`, async t => {
    const f = await fixture(t, 'cosmos-rbac-removal');
    mutate(f);
    await assert.rejects(f.resolve, /immutable image digest/);
  });
}

test('authentication errors are propagated, not mistaken for missing builds', async t => {
  const f = await fixture(t);
  const run = f.run;
  f.run = (command, args, settings) => {
    if (command === 'gh') throw new Error('gh failed: HTTP 401 Bad credentials');
    return run(command, args, settings);
  };
  await assert.rejects(resolveArtifact(f.options, { run: f.run, cwd: f.directory }), /401 Bad credentials/);
});

test('a missing workflow API response includes actionable dispatch guidance', async t => {
  const f = await fixture(t);
  const run = f.run;
  const unavailable = (command, args, settings) => {
    if (command === 'gh' && args[0] === 'api') throw new Error('gh failed: HTTP 404 Not Found');
    return run(command, args, settings);
  };
  await assert.rejects(resolveArtifact(f.options, { run: unavailable, cwd: f.directory }), error => {
    assert.match(error.message, /gh workflow run validate-appservice-app.yml/);
    assert.match(error.message, /HTTP 404 Not Found/);
    return true;
  });
});

test('post-download local modifications are rejected', async t => {
  const f = await fixture(t);
  const run = f.run;
  const modified = (command, args, settings) => {
    const value = run(command, args, settings);
    if (args.at(-1)?.endsWith('/zip')) f.dirty = '?? scenarios/cloud-agent-handover/src/New.cs\0';
    return value;
  };
  await assert.rejects(resolveArtifact(f.options, { run: modified, cwd: f.directory }), /source changed/);
});

test('malformed ZIPs and CRC corruption fail without extraction', () => {
  assert.throws(() => readZip(Buffer.from('not a zip')), /Malformed ZIP/);
  const archive = zip([['entry', 'fixture']]);
  archive[35] ^= 1;
  assert.throws(() => readZip(archive), /CRC mismatch/);
});

test('CLI validates arguments and isolates stdout JSON from diagnostics', async t => {
  const f = await fixture(t);
  const result = await f.resolve();
  const responses = {};
  for (const call of [...f.calls]) {
    const value = f.run(call.command, call.args, call.settings);
    responses[JSON.stringify([call.command, call.args])] = {
      binary: Buffer.isBuffer(value), value: Buffer.isBuffer(value) ? value.toString('base64') : value,
    };
  }
  const preload = path.join(f.directory, 'mock-commands.mjs');
  await writeFile(preload, `
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const responses = ${JSON.stringify(responses)};
childProcess.execFileSync = (command, args) => {
  const result = responses[JSON.stringify([command, args])];
  if (!result) throw new Error('Unexpected mocked command');
  return result.binary ? Buffer.from(result.value, 'base64') : result.value;
};
syncBuiltinESMExports();
`);
  const child = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, resolver,
    '--scenario', f.options.scenario, '--variant', 'application', '--output-dir', f.options.outputDir],
  { encoding: 'utf8', cwd: f.directory });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const output = JSON.parse(child.stdout);
  assert.equal(output.sourceSha, result.sourceSha);
  assert.ok(path.isAbsolute(output.deploymentZip));
  assert.equal(child.stdout.trim().split('\n').length, 1);
  for (const args of [[], ['--scenario'], ['--unknown', 'x'], ['--repo', 'a/b', '--repo', 'c/d']]) {
    const invalid = spawnSync(process.execPath, [resolver, ...args], { encoding: 'utf8', cwd: f.directory });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Artifact resolution failed/);
  }
});
