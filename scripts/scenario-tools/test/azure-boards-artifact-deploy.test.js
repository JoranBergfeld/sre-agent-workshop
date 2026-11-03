import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { readZip } from '../../build-artifacts/resolve.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const capsule = path.join(root, 'scenarios/azure-boards-copilot-handover');
const sha = 'a'.repeat(40);
const hash = createHash('sha256').update('verified-package').digest('hex');

const mock = `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const tool = path.basename(process.argv[1]);
const option = key => args[args.indexOf(key) + 1];
const log = (type, args) => fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({ type, args }) + '\\n');
log(tool, args);
const fail = process.env.MOCK_FAIL;
if (fail && (tool + ' ' + args.join(' ')).includes(fail)) { console.error('mock failure: ' + fail); process.exit(9); }
if (tool === 'git') {
  if (args[0] === 'status') process.stdout.write(process.env.MOCK_DIRTY || '');
  else if (args[0] === 'rev-parse') console.log('${sha}');
  else if (args[0] === 'ls-files') process.stdout.write(args.includes('-z') ? 'order_events/__init__.py\\0' : 'order_events/__init__.py\\n');
  else process.exit(8);
} else if (tool === 'az') {
  const command = args.join(' ');
  const query = option('--query');
  if (command.startsWith('account show')) console.log(query === 'name' ? 'Mock subscription' : 'subscription');
  else if (command.startsWith('functionapp list')) console.log('mock-func');
  else if (command.startsWith('functionapp config appsettings list')) {
    console.log(process.env.MOCK_MISSING_SETTINGS ? '' : query.includes('STORAGE_ACCOUNT') ? 'packagestorage' : 'application-packages');
  } else if (command.startsWith('storage account show')) console.log('https://packagestorage.blob.core.windows.net/');
  else if (command.startsWith('storage blob exists')) console.log(process.env.MOCK_EXISTS || 'false');
  else if (command.startsWith('storage blob download')) fs.writeFileSync(option('--file'), process.env.MOCK_CONFLICT ? 'conflict' : 'verified-package');
  else if (command.startsWith('functionapp show')) console.log(query === 'id' ? '/subscriptions/subscription/resourceGroups/test-rg/providers/Microsoft.Web/sites/mock-func' : 'mock-func.azurewebsites.net');
  else if (command.startsWith('functionapp keys list')) console.log('secret-function-key');
  else if (command.startsWith('rest ') && process.env.MOCK_SYNC_RETRY) {
    const file = process.env.MOCK_LOG + '.sync';
    const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0;
    fs.writeFileSync(file, String(count + 1));
    if (count === 0) { console.error('transient synchronization failure'); process.exit(7); }
  }
} else if (tool === 'curl') {
  const phase = fs.readFileSync(process.env.MOCK_LOG, 'utf8').includes('DEPLOYED_AT_UTC=');
  fs.writeFileSync(option('-o'), JSON.stringify({ deployedCommitSha: process.env.MOCK_STALE === (phase ? 'cutover' : 'go-live') ? 'stale' : '${sha}', packageCommitSha: process.env.MOCK_OLD_PACKAGE === (phase ? 'cutover' : 'go-live') ? 'old-payload-new-setting' : '${sha}' }));
  process.stdout.write(process.env.MOCK_HTTP || '200');
} else if (tool === 'jq') {
  const body = JSON.parse(fs.readFileSync(args.at(-1), 'utf8'));
  const query = args.find(arg => arg.startsWith('.'));
  const value = query.includes('deploymentZip') ? body.deploymentZip : query.includes('sourceSha') ? body.sourceSha : query.includes('files') ? body.files[0].sha256 : query.includes('packageCommitSha') ? body.packageCommitSha : body.deployedCommitSha;
  if (!value) process.exit(1);
  console.log(value);
} else if (tool === 'zip') {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file); else files.push(path.relative(process.cwd(), file));
    }
  }
  walk(process.cwd());
  log('source-package-files', files.sort());
  fs.writeFileSync(args.find(arg => arg.endsWith('.zip')), 'source-package');
}
`;

const resolver = `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({type:'resolver', args}) + '\\n');
if (process.env.MOCK_RESOLVER_FAIL) { console.error('No successful exact-source build'); process.exit(2); }
const output = args[args.indexOf('--output-dir') + 1];
fs.mkdirSync(output, {recursive:true});
const zip = path.join(output, 'deployment.zip');
fs.writeFileSync(zip, 'verified-package');
fs.writeFileSync(path.join(output, 'metadata.json'), JSON.stringify({files:[{sha256:'${hash}'}]}));
console.log(JSON.stringify({scenario:'azure-boards-copilot-handover',variant:'application',sourceSha:'${sha}',deploymentZip:zip}));
`;

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'sre-boards-consumer-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const scripts = path.join(temporary, 'scenarios/azure-boards-copilot-handover/scripts');
  const bin = path.join(temporary, 'bin');
  const build = path.join(temporary, 'scripts/build-artifacts');
  const app = path.join(scripts, '../app');
  for (const directory of [scripts, bin, build, path.join(app, 'order_events')]) await mkdir(directory, { recursive: true });
  for (const shell of ['sh', 'ps1']) {
    await writeFile(path.join(scripts, `deploy.${shell}`), (await readFile(path.join(capsule, `scripts/deploy.${shell}`), 'utf8')).replaceAll('\r\n', '\n'));
  }
  for (const name of ['function_app.py', 'host.json', 'requirements.txt', 'order_events/__init__.py']) await writeFile(path.join(app, name), 'fixture');
  await writeFile(path.join(app, 'local.settings.json'), 'must-not-be-packaged');
  await writeFile(path.join(build, 'resolve.mjs'), resolver);
  await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}');
  for (const name of ['az', 'gh', 'git', 'curl', 'jq', 'ruff', 'mypy', 'pytest', 'zip']) {
    const file = path.join(bin, name);
    await writeFile(file, `#!${process.execPath}\n${mock}`);
    await chmod(file, 0o755);
  }
  return {
    temporary, scripts,
    run(shell, extra = [], environment = {}) {
      const log = path.join(temporary, `calls-${Math.random()}.jsonl`);
      const result = spawnSync(shell === 'Bash' ? 'bash' : 'pwsh',
        shell === 'Bash' ? [path.join(scripts, 'deploy.sh'), ...extra]
          : ['-NoProfile', '-File', path.join(scripts, 'deploy.ps1'), ...extra], {
          encoding: 'utf8', cwd: temporary, timeout: 60_000,
          env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`,
            MOCK_LOG: log, STATUS_POLL_ATTEMPTS: '2', STATUS_POLL_DELAY_SECONDS: '0',
            ...environment },
        });
      return { result, log };
    },
  };
}

async function calls(log) {
  try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

for (const shell of ['Bash', 'PowerShell']) {
  test(`${shell}: default uses exact-source private artifact, disables Oryx and syncs before readiness`, async t => {
    const f = await fixture(t);
    const { result, log } = f.run(shell, ['--repo', 'Learner/Workshop']);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const recorded = await calls(log);
    const index = pattern => recorded.findIndex(call => pattern.test(call.args.join(' ')));
    const resolveIndex = recorded.findIndex(call => call.type === 'resolver');
    assert.ok(resolveIndex >= 0);
    assert.deepEqual(recorded[resolveIndex].args.slice(0, 4), ['--scenario', 'azure-boards-copilot-handover', '--variant', 'application']);
    assert.ok(recorded[resolveIndex].args.includes('Learner/Workshop'));
    assert.ok(resolveIndex < recorded.findIndex(call => call.type === 'az'));
    assert.equal(recorded.filter(call => ['ruff', 'mypy', 'pytest', 'zip'].includes(call.type)).length, 0);
    const upload = index(/storage blob upload/);
    const settings = index(/WEBSITE_RUN_FROM_PACKAGE=https:/);
    const stamp = index(/DEPLOYED_COMMIT_SHA=/);
    const restart = index(/functionapp restart/);
    const sync = index(/syncfunctiontriggers/);
    const status = recorded.findIndex(call => call.type === 'curl');
    const cutover = index(/DEPLOYED_AT_UTC=/);
    assert.ok(upload >= 0 && upload < settings && settings < stamp && stamp < restart && restart < sync && sync < status && status < cutover);
    assert.match(recorded[upload].args.join(' '), new RegExp(`${sha}/${hash}.zip`));
    assert.match(recorded[upload].args.join(' '), /--auth-mode login --overwrite false/);
    assert.match(recorded[settings].args.join(' '), /WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID=SystemAssigned SCM_DO_BUILD_DURING_DEPLOYMENT=false ENABLE_ORYX_BUILD=false/);
    assert.equal(index(/config-zip/), -1);
    assert.equal(recorded.filter(call => call.type === 'curl').length, 2);
    assert.doesNotMatch(result.stdout + result.stderr, /secret-function-key/);
    assert.ok(recorded.filter(call => call.type === 'curl').every(call => !call.args.at(-1).includes('?code=')));
    const tempOutput = recorded[resolveIndex].args[5];
    await assert.rejects(readdir(tempOutput), { code: 'ENOENT' });
  });

  test(`${shell}: artifact to source transition clears package mode before enabling both Oryx switches`, async t => {
    const f = await fixture(t);
    const tempLog = path.join(f.temporary, 'kept-temp.txt');
    const { result, log } = f.run(shell, ['--build-mode', 'source', '--keep-temp'], { DEPLOY_KEEP_TEMP_DIR_LOG: tempLog });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const keptDirectory = (await readFile(tempLog, 'utf8')).trim();
    t.after(() => rm(keptDirectory, { recursive: true, force: true }));
    assert.deepEqual(JSON.parse(await readFile(path.join(keptDirectory, 'stage/build-revision.json'), 'utf8')), { sourceSha: sha });
    const recorded = await calls(log);
    const lines = recorded.map(call => call.args.join(' '));
    const remove = lines.findIndex(line => /appsettings delete.*--setting-names WEBSITE_RUN_FROM_PACKAGE WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID/.test(line));
    const build = lines.findIndex(line => /SCM_DO_BUILD_DURING_DEPLOYMENT=true ENABLE_ORYX_BUILD=true/.test(line));
    const deploy = lines.findIndex(line => /config-zip.*--build-remote true/.test(line));
    assert.ok(remove >= 0 && remove < build && build < deploy);
    assert.equal(recorded.filter(call => call.type === 'resolver').length, 0);
    assert.equal(recorded.filter(call => call.type === 'ruff').length, 2);
    assert.equal(recorded.filter(call => call.type === 'mypy').length, 1);
    assert.equal(recorded.filter(call => call.type === 'pytest').length, 1);
    assert.ok(recorded.some(call => call.type === 'git' && call.args.includes('--untracked-files=all')));
    assert.equal(lines.findIndex(line => /storage blob upload|syncfunctiontriggers/.test(line)), -1);
    if (shell === 'Bash') {
      const packaged = recorded.find(call => call.type === 'source-package-files').args;
      assert.deepEqual(packaged, ['build-revision.json', 'function_app.py', 'host.json', 'order_events/__init__.py', 'requirements.txt']);
    } else {
      const entries = readZip(await readFile(path.join(keptDirectory, 'app.zip')));
      assert.deepEqual(JSON.parse(entries.get('build-revision.json')), { sourceSha: sha });
      assert.ok(entries.has('function_app.py') && entries.has('host.json'));
      assert.ok([...entries.keys()].every(name => !/local.settings|tests\/|\.venv|__pycache__/.test(name)));
    }
  });

  for (const [label, environment, expected] of [
    ['resolver rejection before Azure', { MOCK_RESOLVER_FAIL: '1' }, /exact-source|resolution failed/i],
    ['upload denial', { MOCK_FAIL: 'storage blob upload' }, /mock failure|Package upload failed/],
    ['missing package settings', { MOCK_MISSING_SETTINGS: '1' }, /Re-provision/],
    ['setting write failure', { MOCK_FAIL: 'appsettings set' }, /mock failure|configure/],
    ['persistent sync failure', { MOCK_FAIL: 'syncfunctiontriggers' }, /synchronization failed/],
    ['wrong live SHA', { MOCK_STALE: 'go-live' }, /go-live/],
    ['wrong cutover SHA', { MOCK_STALE: 'cutover' }, /cutover/],
    ['old payload with a new deployment setting', { MOCK_OLD_PACKAGE: 'go-live' }, /embedded package/],
    ['old payload after cutover', { MOCK_OLD_PACKAGE: 'cutover' }, /embedded package/],
    ['HTTP error with right SHA', { MOCK_HTTP: '500' }, /Timed out/],
    ['existing blob conflict', { MOCK_EXISTS: 'true', MOCK_CONFLICT: '1' }, /checksum conflict/],
  ]) {
    test(`${shell}: fails explicitly on ${label}`, async t => {
      const f = await fixture(t);
      const { result, log } = f.run(shell, [], environment);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
      assert.doesNotMatch(result.stdout + result.stderr, /secret-function-key/);
      const recorded = await calls(log);
      if (environment.MOCK_RESOLVER_FAIL) assert.equal(recorded.filter(call => call.type === 'az').length, 0);
      if (environment.MOCK_STALE === 'go-live' || environment.MOCK_OLD_PACKAGE === 'go-live') assert.equal(recorded.filter(call => call.args.join(' ').includes('DEPLOYED_AT_UTC=')).length, 0);
      if (environment.MOCK_FAIL === 'syncfunctiontriggers') assert.equal(recorded.filter(call => call.args.join(' ').includes('syncfunctiontriggers')).length, 2);
    });
  }

  test(`${shell}: retries trigger sync and reuses an existing byte-identical blob without overwriting`, async t => {
    const f = await fixture(t);
    const { result, log } = f.run(shell, [], { MOCK_EXISTS: 'true', MOCK_SYNC_RETRY: '1' });
    assert.equal(result.status, 0, result.stderr);
    const recorded = await calls(log);
    assert.equal(recorded.filter(call => call.args.join(' ').includes('syncfunctiontriggers')).length, 2);
    assert.equal(recorded.filter(call => call.args.join(' ').includes('storage blob upload')).length, 0);
  });

  for (const [label, extra, environment] of [
    ['invalid build mode', ['--build-mode', 'auto'], {}],
    ['dirty source mode', ['--build-mode', 'source'], { MOCK_DIRTY: '?? app/new.py' }],
    ['quality gate failure', ['--build-mode', 'source'], { MOCK_FAIL: 'ruff format' }],
    ['source transition removal failure', ['--build-mode', 'source'], { MOCK_FAIL: 'appsettings delete' }],
  ]) {
    test(`${shell}: rejects ${label} before any deployment`, async t => {
      const f = await fixture(t);
      const { result, log } = f.run(shell, extra, environment);
      assert.notEqual(result.status, 0);
      assert.equal((await calls(log)).filter(call => call.args.join(' ').includes('config-zip')).length, 0);
    });
  }

  test(`${shell}: source mode also refuses old payload with a new deployment setting`, async t => {
    const f = await fixture(t);
    const { result, log } = f.run(shell, ['--build-mode', 'source'], { MOCK_OLD_PACKAGE: 'go-live' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /embedded package/);
    assert.equal((await calls(log)).filter(call => call.args.join(' ').includes('DEPLOYED_AT_UTC=')).length, 0);
  });
}

test('private package storage and reader scope do not expand application data privileges', async () => {
  const storage = await readFile(path.join(capsule, 'infra/bicep/modules/storage.bicep'), 'utf8');
  const app = await readFile(path.join(capsule, 'infra/bicep/modules/function-app.bicep'), 'utf8');
  assert.match(storage, /name: 'application-packages'[\s\S]*publicAccess: 'None'/);
  assert.match(storage, /allowBlobPublicAccess: false/);
  assert.match(app, /scope: applicationPackages/);
  assert.match(app, /2a2b9908-6ea1-4ae2-8e65-a410df84e7d1/);
  assert.match(app, /principalId: functionApp.identity.principalId/);
  assert.doesNotMatch(app, /scope: hostStorage|Storage Blob Data Contributor/);
});

test('settings preserve deployment values for first creation and infrastructure reruns', async () => {
  const app = await readFile(path.join(capsule, 'infra/bicep/modules/function-app.bicep'), 'utf8');
  assert.doesNotMatch(app, /appSettings: \[/);
  assert.match(app, /resource appSettings 'Microsoft.Web\/sites\/config@2023-12-01'/);
  assert.match(app, /parent: functionApp[\s\S]*properties: union\(list\('\$\{functionApp.id\}\/config\/appsettings', '2023-12-01'\).properties,/);
  assert.doesNotMatch(app, /output .*list\(|output .*ConnectionString/);
});

test('compiled settings merge executes after site creation and never emits secret settings', () => {
  const file = path.join(capsule, 'infra/bicep/modules/function-app.bicep');
  let compiled;
  for (const command of ['bicep', path.join(process.env.AZURE_CONFIG_DIR ?? path.join(homedir(), '.azure'), 'bin/bicep')]) {
    const result = spawnSync(command, ['build', file, '--stdout'], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') continue;
    assert.equal(result.status, 0, result.stderr);
    compiled = JSON.parse(result.stdout);
    break;
  }
  assert.ok(compiled, 'Bicep CLI is required to validate the first-create/rerun settings merge contract');
  const site = compiled.resources.find(resource => resource.type === 'Microsoft.Web/sites');
  const settings = compiled.resources.find(resource => resource.type === 'Microsoft.Web/sites/config');
  assert.equal(site.properties.siteConfig.appSettings, undefined);
  assert.match(settings.properties, /^\[union\(list\(format\('\{0\}\/config\/appsettings'/);
  assert.ok(settings.dependsOn.some(dependency => dependency.includes("resourceId('Microsoft.Web/sites'")));
  assert.ok(Object.values(compiled.outputs).every(output =>
    !/list\(|hostStorageConnectionString|appsettings/.test(output.value)));
  const canonical = { FUNCTIONS_WORKER_RUNTIME: 'python' };
  for (const current of [{}, {
    WEBSITE_RUN_FROM_PACKAGE: 'https://private/package.zip',
    WEBSITE_RUN_FROM_PACKAGE_BLOB_MI_RESOURCE_ID: 'SystemAssigned',
    DEPLOYED_COMMIT_SHA: sha, DEPLOYED_AT_UTC: '2026-11-03T12:00:00Z',
    AzureWebJobsStorage: 'previous-private-value',
  }]) {
    const merged = { ...current, ...canonical };
    for (const [key, value] of Object.entries(current)) assert.equal(merged[key], value);
    assert.equal(merged.FUNCTIONS_WORKER_RUNTIME, 'python');
  }
});
