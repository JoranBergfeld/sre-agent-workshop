import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { packageApp } from './package.mjs';

const capsule = fileURLToPath(new URL('../', import.meta.url));
const scenario = 'appservice-latency-context';
const repository = path.resolve(capsule, '../..');
let lock;

async function command(executable, args) {
  const windowsAzure = process.platform === 'win32' && executable === 'az';
  const child = spawn(windowsAzure ? 'pwsh.exe' : executable,
    windowsAzure ? ['-NoProfile', '-NonInteractive', '-File', path.join(capsule, 'scripts/azure-command.ps1')] : args,
    {
      stdio: ['ignore', 'pipe', 'pipe'], shell: false, cwd: repository,
      env: windowsAzure ? { ...process.env, ALCTX_AZURE_ARGS: JSON.stringify(args) } : process.env,
    });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${executable} ${args.slice(0, 3).join(' ')} failed (${code})${executable === 'az' ? '' : `: ${stderr}`}`);
  return stdout;
}

async function request(url, route) {
  const output = await command(process.platform === 'win32' ? 'curl.exe' : 'curl', [
    '--silent', '--show-error', '--fail', '--include', '--suppress-connect-headers', '--max-time', '60',
    '--write-out', '\n%{time_total}', `${url}${route}`,
  ]);
  const lines = output.trim().split('\n');
  const durationMs = Number(lines.pop()) * 1000;
  const response = lines.join('\n');
  const separator = /\r?\n\r?\n/.exec(response);
  if (!separator) throw new Error('HTTP response has no header/body boundary');
  if (!/^HTTP\/\S+ 200\b/m.test(response.slice(0, separator.index))) throw new Error('Expected HTTP 200');
  const body = JSON.parse(response.slice(separator.index + separator[0].length));
  const requestId = /x-request-id:\s*([^\r\n]+)/i.exec(response)?.[1];
  if (!requestId || !Number.isFinite(durationMs)) throw new Error('Missing request correlation or duration');
  return { route, durationMs, requestId, body, observedAt: new Date().toISOString() };
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--local-build' && !options['local-build']) {
      options['local-build'] = true;
      i--;
      continue;
    }
    if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Options require --name value pairs');
    }
    if (options[args[i].slice(2)]) throw new Error(`Duplicate option ${args[i]}`);
    options[args[i].slice(2)] = args[i + 1];
  }
  if (operation === 'setup' && !options.subscription) {
    throw new Error('Setup requires an explicit --subscription UUID');
  }
  if (!['setup', 'inject', 'validate', 'reset', 'evidence', 'cleanup', 'deploy'].includes(operation)) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  const allowed = ['subscription', 'resource-group', 'state-dir',
    ...(['setup', 'inject', 'reset', 'deploy'].includes(operation) ? ['local-build', 'location', 'workload'] : []),
    ...({ validate: ['expect'], deploy: ['source-dir', 'reviewed', 'variant'] }[operation] || [])];
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Unknown option --${key} for ${operation}`);
  const directory = path.resolve(options['state-dir'] || path.join(capsule, '.azure'));
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, '.operation-lock');
  try { await mkdir(lockPath); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another operation holds .operation-lock; do not run lifecycle operations concurrently');
    throw error;
  }
  lock = lockPath;
  const stateFile = path.join(directory, 'state.json');
  let state;
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const subscription = options.subscription || state?.subscription;
  const group = options['resource-group'] || state?.group || 'alctx-rg';
  const workload = options.workload || state?.workload || 'alctx';
  const location = options.location || state?.preferredLocation || 'westeurope';
  if (!/^[a-z][a-z0-9-]{0,59}$/.test(workload)) throw new Error('Invalid workload name');
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(subscription || '')) {
    throw new Error('A subscription UUID is required');
  }
  if (!/^alctx-[a-z0-9-]{1,60}$/.test(group)) throw new Error('Resource group must use the dedicated alctx- prefix');
  if (state && (state.subscription !== subscription || state.group !== group || (state.workload && state.workload !== workload))) throw new Error('State scope mismatch');
  const az = async (...args) => {
    const output = await command('az', [
      ...args, '--subscription', subscription, '--output', 'json', '--only-show-errors',
    ]);
    return output.trim() ? JSON.parse(output) : null;
  };
  const save = async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  };
  const exists = await az('group', 'exists', '--name', group);
  const owned = tags => tags?.scenario === scenario && tags?.owner === state?.owner;
  let resourceGroup;
  if (exists) {
    resourceGroup = await az('group', 'show', '--name', group);
    if (!state?.owner || !owned(resourceGroup.tags)) {
      const resources = await az('resource', 'list', '--resource-group', group);
      if (operation !== 'setup' || resources.length || resourceGroup.tags?.owner
        || resourceGroup.tags?.['sre-workshop-scenario'] !== scenario) {
        throw new Error('Refusing resource group: scenario ownership mismatch');
      }
    }
  }
  if (operation === 'cleanup' && !exists) {
    console.log('Resource group already absent; local state and evidence retained.');
    return;
  }
  if (!['setup', 'cleanup'].includes(operation) && (!state?.appName || !exists)) throw new Error('Run setup first for this scope');
  const exportEvidence = async () => {
    const stamp = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
    const activity = await az('monitor', 'activity-log', 'list', '--resource-group', group, '--offset', '1d', '--max-events', '100');
    const telemetry = state.workspaceId ? await az('monitor', 'log-analytics', 'query', '--workspace', state.workspaceId,
      '--analytics-query', `union isfuzzy=true withsource=Table (datatable(TimeGenerated:datetime, AppRoleName:string)[]), AppRequests, AppTraces | where AppRoleName == '${state.appName}' | order by TimeGenerated desc | take 500`,
      '--timespan', 'P1D') : { unavailable: 'Setup did not complete; no configured runtime telemetry state. Activity and ownership state retained.' };
    await mkdir(path.join(directory, 'evidence'), { recursive: true });
    const file = path.join(directory, 'evidence', `${stamp}.json`);
    await writeFile(file, JSON.stringify({ state, activity, telemetry, capturedAt: new Date().toISOString() }, null, 2));
    console.log(`Bounded evidence exported: ${file}`);
  };
  const placement = (mode, extra = []) => command('node', [
    path.join(repository, 'scripts/placement/provision.mjs'), mode, scenario,
    '--location', location, '--workload', workload, '--resource-group', group,
    '--subscription', subscription, ...extra,
  ]);
  let revision;
  let archive;
  let artifact;
  if (['setup', 'inject', 'reset', 'deploy'].includes(operation)) {
    revision = operation === 'inject' ? 'faulty' : 'healthy';
    if (operation === 'deploy') {
      if (options['source-dir'] || options.reviewed) {
        if (options.reviewed !== 'yes' || !options['source-dir'] || options.variant) {
          throw new Error('Reviewed deploy requires --reviewed yes --source-dir PATH without --variant');
        }
        revision = 'reviewed';
      } else {
        revision = options.variant || 'healthy';
        if (!['healthy', 'faulty'].includes(revision)) throw new Error('Variant must be healthy or faulty');
      }
    }
    await placement('check', ['--require-group']);
    if (revision === 'reviewed' || options['local-build']) {
      archive = path.join(directory, `deployment-${randomUUID()}.zip`);
      await writeFile(archive, await packageApp(capsule, revision, options['source-dir'] && path.resolve(options['source-dir'])));
    } else {
      artifact = JSON.parse(await command('node', [
        path.join(repository, 'scripts/build-artifacts/resolve.mjs'),
        '--scenario', scenario, '--variant', revision, '--output-dir', directory,
      ]));
      if (artifact.scenario !== scenario || artifact.variant !== revision
        || !/^[a-f0-9]{40}$/.test(artifact.sourceSha || '') || !path.isAbsolute(artifact.deploymentZip || '')) {
        throw new Error('Unexpected artifact resolver result');
      }
      archive = artifact.deploymentZip;
    }
  }
  const deploy = async () => {
    await az('webapp', 'deploy', '--resource-group', group, '--name', state.appName,
      '--src-path', archive, '--type', 'zip', '--clean', 'true', '--restart', 'true', '--track-status', 'true');
    state.revision = revision;
    state.deployedAt = new Date().toISOString();
    // Azure deployment responses can contain credential-bearing URLs; retain only provenance.
    state.artifact = artifact ? { sourceSha: artifact.sourceSha, variant: artifact.variant } : { source: 'local', revision };
    await save();
    console.log(`Deployed ${revision}: ${state.url}. This is a deployment state, not evidence of code repair.`);
  };
  if (['setup', 'deploy'].includes(operation)) {
    if (!state) {
      state = { subscription, group, workload, preferredLocation: location, owner: randomUUID(), scenario };
      await save();
    }
    if (!exists) {
      throw new Error('Operator must pre-create and designate the resource group; setup never creates groups');
    }
    if (operation === 'deploy') await exportEvidence();
    const apps = await az('webapp', 'list', '--resource-group', group);
    for (const namespace of ['Microsoft.Web', 'Microsoft.Insights', 'Microsoft.OperationalInsights']) {
      await az('provider', 'register', '--namespace', namespace, '--wait');
    }
    if (!owned(resourceGroup.tags)) {
      await az('group', 'update', '--name', group, '--set', `tags.scenario=${scenario}`, `tags.owner=${state.owner}`);
    }
    const outputsFile = path.join(directory, `outputs-${randomUUID()}.json`);
    await placement('deploy', ['--param', `owner=${state.owner}`,
      '--outputs-file', outputsFile]);
    const outputs = JSON.parse(await readFile(outputsFile, 'utf8'));
    state.appName = outputs.appName.value;
    state.url = outputs.url.value;
    state.workspaceId = outputs.workspaceId.value;
    if (!/^alctx-[a-z0-9-]+$/.test(state.appName) || state.url !== `https://${state.appName}.azurewebsites.net`) {
      throw new Error('Unexpected deployment scope');
    }
    await save();
    // Repeated setup must not silently reset an existing incident.
    if (operation === 'deploy' || !state.revision || !apps.length) await deploy();
    if (operation === 'setup') console.log(`Setup ready: ${state.url}; state: ${stateFile}`);
  } else if (operation === 'inject') {
    await deploy();
  } else if (operation === 'reset') {
    await exportEvidence();
    await deploy();
  } else if (operation === 'evidence') {
    await exportEvidence();
  } else if (operation === 'validate') {
    const expected = options.expect || state.revision;
    if (!['healthy', 'faulty', 'reviewed'].includes(expected)) throw new Error('Expected state must be healthy, faulty or reviewed');
    const order = request(state.url, '/api/orders/DEMO-1001');
    order.catch(() => {});
    const healthy = [];
    for (let i = 0; i < 3; i++) healthy.push(await request(state.url, '/health'));
    const result = await order;
    const record = { expected, order: result, health: healthy };
    const file = path.join(directory, `observation-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify(record, null, 2));
    const validBody = isDeepStrictEqual(result.body, {
      orderId: 'DEMO-1001', status: 'processing', estimatedDelivery: '2026-12-10',
    });
    if (!validBody || healthy.some(item => item.body.status !== 'healthy' || item.durationMs >= 10_000)) {
      throw new Error(`Application payload or independent health failed; inspect ${file}`);
    }
    if (expected === 'faulty' ? result.durationMs < 15_000 : result.durationMs >= 10_000) {
      throw new Error(`Runtime does not match expected ${expected} state; inspect ${file}. Hosting bounds are not an SLO.`);
    }
    console.log(`Environment state ${expected} observed; ${file}. This does not assess learner work or prove a code repair.`);
  } else if (operation === 'cleanup') {
    await exportEvidence();
    const resourceGroup = await az('group', 'show', '--name', group);
    if (!owned(resourceGroup.tags)) throw new Error('Refusing cleanup: resource-group ownership changed');
    const resources = await az('resource', 'list', '--resource-group', group);
    if (resources.some(resource => !owned(resource.tags))) throw new Error('Refusing cleanup: resource group contains resources not owned by this scenario run');
    await az('group', 'delete', '--name', group, '--yes');
    console.log('Scenario-owned resource group deleted; local evidence, source and GitHub artifacts retained.');
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { if (lock) await rmdir(lock); });
