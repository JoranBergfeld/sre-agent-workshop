import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const contracts = {
  'cloud-agent-handover': {
    workflow: 'validate-appservice-app.yml', source: ['src', 'tests'],
    variants: { application: 'dotnet-10-linux-x64' },
  },
  'azure-boards-copilot-handover': {
    workflow: 'validate-azure-boards-copilot-handover-app.yml', source: ['app'],
    variants: { application: 'python-3.12-linux-x64' },
  },
  'appservice-latency-context': {
    workflow: 'build-appservice-latency-context.yml',
    source: ['src', 'tests', 'scripts/package.mjs', 'scripts/build-artifact.mjs', 'scripts/local.mjs', 'infra/nginx.conf'],
    variants: { healthy: 'php-8.3-linux', faulty: 'php-8.3-linux', 'reviewed-source': 'php-8.3-linux' },
  },
  'cosmos-rbac-removal': {
    workflow: 'publish-cosmos-rbac-removal-image.yml', source: ['src'],
    variants: { application: 'linux/amd64' }, image: true,
  },
  'workload-identity-break': {
    workflow: 'publish-workload-identity-break-image.yml', source: ['src'],
    variants: { application: 'linux/amd64' }, image: true,
  },
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function execute(command, args, { cwd, binary = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd, encoding: binary ? undefined : 'utf8',
      maxBuffer: 256 * 1024 * 1024, timeout: 120_000,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`${command} failed: ${error.stderr?.toString().trim() || error.message}`, { cause: error });
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Inspect archives in memory; no downloaded entry is ever extracted by a shell/tool.
export function readZip(bytes) {
  requireValue(Buffer.isBuffer(bytes) && bytes.length >= 22, 'Malformed ZIP archive');
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  requireValue(end >= Math.max(0, bytes.length - 65557), 'Missing ZIP directory');
  requireValue(end + 22 + bytes.readUInt16LE(end + 20) === bytes.length, 'Invalid ZIP trailer');
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  requireValue(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0
    && bytes.readUInt16LE(end + 8) === count && count > 0 && count < 65535
    && cursor + size === end, 'Unsupported ZIP directory');
  const entries = new Map();
  let total = 0;
  for (let index = 0; index < count; index++) {
    requireValue(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'Malformed ZIP entry');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressed = bytes.readUInt32LE(cursor + 20);
    const expanded = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28);
    const extraSize = bytes.readUInt16LE(cursor + 30);
    const commentSize = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    requireValue(next <= end, 'Truncated ZIP directory');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
    requireValue(name && !name.includes('\ufffd') && !/[\x00-\x1f\\:]/.test(name)
      && !name.startsWith('/') && !name.split('/').some(part => part === '..' || part === '.')
      && !entries.has(name), 'Unsafe or duplicate ZIP path');
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    requireValue((mode & 0xf000) !== 0xa000, 'ZIP symlinks are not allowed');
    total += expanded;
    requireValue(!(flags & 1) && [0, 8].includes(method) && total <= 512 * 1024 * 1024,
      'Encrypted, unsupported, or oversized ZIP');
    requireValue(offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50,
      'Invalid ZIP local header');
    const localNameSize = bytes.readUInt16LE(offset + 26);
    const start = offset + 30 + localNameSize + bytes.readUInt16LE(offset + 28);
    requireValue(bytes.subarray(offset + 30, offset + 30 + localNameSize).toString('utf8') === name
      && bytes.readUInt16LE(offset + 8) === method && start + compressed <= bytes.readUInt32LE(end + 16),
    'ZIP local header mismatch');
    const compressedBytes = bytes.subarray(start, start + compressed);
    const body = method === 0 ? compressedBytes : inflateRawSync(compressedBytes, { maxOutputLength: Math.max(1, expanded) });
    requireValue(body.length === expanded && crc32(body) === checksum, 'ZIP size or CRC mismatch');
    entries.set(name, body);
    cursor = next;
  }
  requireValue(cursor === end, 'ZIP directory size mismatch');
  return entries;
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch { throw new Error(`Malformed ${label} JSON`); }
}

function sameRepo(value, repository) {
  return typeof value === 'string' && value.toLowerCase() === repository.toLowerCase();
}

export async function resolveArtifact(options, { run = execute, cwd = process.cwd() } = {}) {
  const { scenario, variant } = options;
  const contract = Object.hasOwn(contracts, scenario) ? contracts[scenario] : undefined;
  requireValue(contract && Object.hasOwn(contract.variants, variant), 'Unsupported scenario or variant');
  requireValue(typeof options.outputDir === 'string' && options.outputDir.length > 0, '--output-dir is required');
  if (options.repo !== undefined) requireValue(/^[\w.-]+\/[\w.-]+$/.test(options.repo), '--repo must be owner/name');
  let gitCwd = cwd;
  const git = (...args) => run('git', args, { cwd: gitCwd }).toString().trim();
  const root = git('rev-parse', '--show-toplevel');
  gitCwd = root;
  const sha = git('rev-parse', '--verify', 'HEAD^{commit}');
  requireValue(/^[a-f0-9]{40}$/.test(sha), 'Git HEAD must be a full commit SHA');
  const sourcePaths = [
    ...contract.source.map(name => `scenarios/${scenario}/${name}`),
    'scripts/build-artifacts', `.github/workflows/${contract.workflow}`,
  ];
  if (scenario === 'cloud-agent-handover') {
    for (const ancestor of ['', 'scenarios/', `scenarios/${scenario}/`]) {
      for (const name of ['Directory.Build.props', 'Directory.Build.targets', 'Directory.Packages.props',
        'NuGet.Config', 'nuget.config', 'global.json']) sourcePaths.push(`${ancestor}${name}`);
    }
  }
  const dirty = git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...sourcePaths);
  requireValue(!dirty, `Dirty deployable source for ${scenario}; commit tracked and untracked source changes before resolving artifacts.`);
  const gh = (...args) => run('gh', args, { cwd: root });
  let origin;
  if (!options.repo) {
    let remote;
    try { remote = git('remote', 'get-url', 'origin'); } catch (error) {
      throw new Error(`Cannot discover origin; provide --repo owner/name. ${error.message}`, { cause: error });
    }
    const match = /^(?:https:\/\/|ssh:\/\/git@|git@)([A-Za-z0-9.-]+)[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote);
    requireValue(match, 'Cannot discover a GitHub repository from origin; provide --repo owner/name');
    origin = { host: match[1], repository: match[2] };
  }
  const requestedRepo = options.repo || `${origin.host}/${origin.repository}`;
  const repoArgs = ['repo', 'view', requestedRepo, '--json', 'nameWithOwner,url'];
  const discovered = parseJson(gh(...repoArgs), 'repository');
  requireValue(discovered && /^[\w.-]+\/[\w.-]+$/.test(discovered.nameWithOwner), 'Malformed repository identity');
  const repository = discovered.nameWithOwner;
  requireValue(sameRepo(options.repo || origin.repository, repository), 'Requested repository identity mismatch');
  let url;
  try { url = new URL(discovered.url); } catch { throw new Error('Malformed repository URL'); }
  requireValue(url.protocol === 'https:' && url.pathname.toLowerCase() === `/${repository.toLowerCase()}`
    && !url.username && !url.password && !url.search && !url.hash, 'Repository URL identity mismatch');
  requireValue(!origin || origin.host.toLowerCase() === url.hostname.toLowerCase(), 'Origin repository host mismatch');
  const missing = () => {
    const branch = git('branch', '--show-current');
    const tags = branch ? [] : git('tag', '--points-at', 'HEAD').split('\n').filter(Boolean).sort();
    const ref = branch || tags[0];
    const repoRef = url.hostname === 'github.com' ? repository : `${url.hostname}/${repository}`;
    const example = `gh workflow run ${contract.workflow} --repo ${repoRef} --ref ${ref ? JSON.stringify(ref) : '<branch-or-tag>'}`;
    return new Error(`No successful, unexpired exact-source build for ${scenario}/${variant} at ${sha}. `
      + `Publish this commit and run: ${example}. `
      + (!branch ? 'Detached HEAD: select or create a branch/tag pointing to this commit; --ref cannot be a raw commit SHA. ' : '')
      + 'No other source SHA will be used. Authentication failures must be resolved with gh auth login.');
  };
  const api = (endpoint, paginate = false) => {
    try {
      return parseJson(gh(
        'api', '--hostname', url.hostname, ...(paginate ? ['--paginate', '--slurp'] : []), endpoint,
      ), 'GitHub API');
    } catch (error) {
      if (/\bHTTP 404\b/.test(error.message)) {
        throw new Error(`${missing().message} GitHub response: ${error.message}`, { cause: error });
      }
      throw error;
    }
  };
  const workflowPath = `.github/workflows/${contract.workflow}`;
  const workflow = api(`repos/${repository}/actions/workflows/${contract.workflow}`);
  requireValue(Number.isSafeInteger(workflow?.id) && workflow.id > 0 && workflow.path === workflowPath
    && workflow.state === 'active', 'Unexpected or inactive scenario workflow identity');
  const pages = api(`repos/${repository}/actions/workflows/${workflow.id}/runs?head_sha=${sha}&per_page=100`, true);
  requireValue(Array.isArray(pages) && pages.every(page => Array.isArray(page?.workflow_runs)), 'Malformed workflow runs response');
  const candidates = pages.flatMap(page => page.workflow_runs);
  const validateRun = runData => {
    requireValue(runData && Number.isSafeInteger(runData.id) && runData.id > 0
      && runData.workflow_id === workflow.id && runData.path === workflowPath
      && sameRepo(runData.repository?.full_name, repository)
      && sameRepo(runData.head_repository?.full_name, repository)
      && runData.head_sha === sha && ['push', 'workflow_dispatch'].includes(runData.event)
      && runData.status === 'completed' && runData.conclusion === 'success'
      && Number.isSafeInteger(runData.run_attempt) && runData.run_attempt > 0
      && typeof runData.head_branch === 'string' && runData.head_branch.length > 0,
    'Untrusted GitHub run identity, repository, event, conclusion, or source SHA');
  };
  const artifactName = `${scenario}-${variant}-${sha}`;
  for (const candidate of candidates) {
    requireValue(candidate && typeof candidate === 'object'
      && typeof candidate.status === 'string'
      && (typeof candidate.conclusion === 'string' || candidate.conclusion === null),
    'Malformed workflow run');
    if (candidate.status !== 'completed' || candidate.conclusion !== 'success'
      || !['push', 'workflow_dispatch'].includes(candidate.event)) continue;
    validateRun(candidate);
    const build = api(`repos/${repository}/actions/runs/${candidate.id}`);
    validateRun(build);
    requireValue(build.id === candidate.id && build.run_attempt === candidate.run_attempt, 'GitHub run changed during resolution');
    const artifactPages = api(`repos/${repository}/actions/runs/${build.id}/artifacts?per_page=100`, true);
    requireValue(Array.isArray(artifactPages) && artifactPages.every(page => Array.isArray(page?.artifacts)
      && page.artifacts.every(artifact => artifact && typeof artifact.name === 'string')),
      'Malformed artifact list');
    const artifacts = artifactPages.flatMap(page => page.artifacts).filter(artifact => artifact.name === artifactName);
    requireValue(artifacts.length <= 1, 'Ambiguous exact-name deployment artifacts');
    if (!artifacts.length || artifacts[0].expired === true) continue;
    const artifact = artifacts[0];
    requireValue(artifact.expired === false && Number.isSafeInteger(artifact.id) && artifact.id > 0
      && artifact.workflow_run?.id === build.id && artifact.workflow_run?.head_sha === sha,
    'Artifact API source/run identity mismatch');
    const bytes = run('gh', ['api', '--hostname', url.hostname,
      `repos/${repository}/actions/artifacts/${artifact.id}/zip`], { cwd: root, binary: true });
    if (artifact.digest !== undefined && artifact.digest !== null) {
      requireValue(artifact.digest === `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        'Downloaded Actions artifact digest mismatch');
    }
    const entries = readZip(bytes);
    const expectedNames = contract.image ? ['metadata.json'] : ['deployment.zip', 'metadata.json'];
    requireValue(entries.size === expectedNames.length && expectedNames.every(name => entries.has(name)),
      'Unexpected deployment artifact layout');
    const metadata = parseJson(entries.get('metadata.json').toString('utf8'), 'artifact metadata');
    requireValue(metadata?.schemaVersion === 1 && sameRepo(metadata.repository, repository)
      && metadata.scenario === scenario && metadata.variant === variant && metadata.sourceSha === sha
      && metadata.runtime === contract.variants[variant] && Array.isArray(metadata.files)
      && metadata.build?.runId === String(build.id) && metadata.build.runAttempt === String(build.run_attempt)
      && metadata.build.event === build.event
      && ['refs/heads/', 'refs/tags/'].some(prefix => metadata.build.ref === `${prefix}${build.head_branch}`),
    'Artifact metadata binding mismatch');
    requireValue(variant !== 'reviewed-source' || metadata.build.ref === 'refs/heads/main',
      'Reviewed-source artifacts must come from main');
    const result = { scenario, variant, sourceSha: sha };
    if (contract.image) {
      const digest = metadata.image?.digest;
      requireValue(metadata.files.length === 0 && /^sha256:[0-9a-f]{64}$/.test(digest)
        && metadata.image.reference === `ghcr.io/${repository.toLowerCase()}/${scenario}/app@${digest}`,
      'Invalid immutable image digest/reference');
      result.imageReference = metadata.image.reference;
    } else {
      const zip = entries.get('deployment.zip');
      const file = metadata.files[0];
      requireValue(metadata.files.length === 1 && file?.path === 'deployment.zip'
        && file.size === zip.length && file.sha256 === createHash('sha256').update(zip).digest('hex')
        && metadata.image === undefined, 'Deployment ZIP checksum or file contract mismatch');
      const deployment = readZip(zip);
      const required = scenario === 'cloud-agent-handover'
        ? ['HandoverApp.dll', 'HandoverApp.deps.json', 'HandoverApp.runtimeconfig.json']
        : scenario === 'azure-boards-copilot-handover'
          ? ['host.json', 'function_app.py', 'requirements.txt', 'order_events/__init__.py',
            '.python_packages/lib/site-packages/azure/functions/__init__.py']
          : ['index.php', 'timing.php', 'telemetry.php', 'nginx.conf', 'deployment.json'];
      requireValue(required.every(name => deployment.has(name)), 'Invalid deployment ZIP root layout');
      if (scenario === 'appservice-latency-context') {
        requireValue(deployment.size === required.length, 'Unexpected latency ZIP entries');
        const revision = parseJson(deployment.get('deployment.json'), 'latency deployment').revision;
        requireValue(revision === { healthy: 'baseline-v1', faulty: 'candidate-v2', 'reviewed-source': 'reviewed-source' }[variant],
          'Latency deployment variant mismatch');
      }
    }
    // Recheck local source after network I/O; never return stale local-source assurance.
    requireValue(git('rev-parse', '--verify', 'HEAD^{commit}') === sha
      && !git('status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...sourcePaths),
    'Deployable source changed while resolving artifact');
    const output = path.resolve(cwd, options.outputDir);
    await mkdir(output, { recursive: true });
    const destination = await mkdtemp(path.join(output, `${scenario}-${variant}-`));
    for (const [name, content] of entries) await writeFile(path.join(destination, name), content, { flag: 'wx' });
    if (!contract.image) result.deploymentZip = path.join(destination, 'deployment.zip');
    return result;
  }
  throw missing();
}

export async function main(argv = process.argv.slice(2), dependencies) {
  const options = {};
  const names = { '--scenario': 'scenario', '--variant': 'variant', '--output-dir': 'outputDir', '--repo': 'repo' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = Object.hasOwn(names, argv[index]) ? names[argv[index]] : undefined;
    requireValue(key && argv[index + 1] && !argv[index + 1].startsWith('--') && options[key] === undefined,
      'Usage: node scripts/build-artifacts/resolve.mjs --scenario <id> --variant <variant> --output-dir <directory> [--repo owner/name]');
    options[key] = argv[index + 1];
  }
  return resolveArtifact(options, dependencies);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`Artifact resolution failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
