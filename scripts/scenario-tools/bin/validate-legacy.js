import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { WORKSHOPS_DIR } from '../lib/paths.js';
import { legacyListTracks, legacyScenarioDirs, legacyLoadScenario } from '../lib/scenarios.js';
import { makeLegacyValidator } from '../lib/validate.js';
import { LEGACY_README_BEGIN, LEGACY_README_END, legacyRenderIndex, legacyRenderAggregator, legacyRenderReadmeBlock } from '../lib/legacy-generate.js';

const fileExists = (p) => existsSync(p);
const isExecutable = (p) => {
  try { return (statSync(p).mode & 0o111) !== 0; } catch { return false; }
};

function pathError(label) {
  return `${label} must stay inside the scenario directory`;
}

function checkLegacyPath(errors, dir, label, rawPath, { fileExists, isExecutable = () => true }) {
  const requireExecutable = label.endsWith('.bash');

  if (!rawPath) {
    errors.push(`${label} is required`);
    return;
  }

  if (isAbsolute(rawPath)) {
    errors.push(pathError(label));
    return;
  }

  const resolved = resolve(dir, rawPath);
  const rel = relative(dir, resolved);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    errors.push(pathError(label));
    return;
  }

  if (!fileExists(resolved)) {
    errors.push(`${label} references missing file ${rawPath}`);
    return;
  }

  if (requireExecutable && !isExecutable(resolved)) {
    errors.push(`${label} ${rawPath} must be executable (chmod +x)`);
  }
}

function checkLegacyScenario({ track, id, manifest, dir }, io) {
  const errors = [];

  if (manifest.id !== id) errors.push(`id "${manifest.id}" must equal folder name "${id}"`);
  if (manifest.track !== track) errors.push(`track "${manifest.track}" must equal parent track "${track}"`);

  checkLegacyPath(errors, dir, 'docPage', manifest.docPage, io);

  for (const kind of ['inject', 'validate']) {
    const pair = manifest[kind] ?? {};
    checkLegacyPath(errors, dir, `${kind}.bash`, pair.bash, io);
    checkLegacyPath(errors, dir, `${kind}.powershell`, pair.powershell, io);
  }

  for (const action of manifest.remediate ?? []) {
    checkLegacyPath(errors, dir, `remediate.${action.action}.bash`, action.bash, io);
    checkLegacyPath(errors, dir, `remediate.${action.action}.powershell`, action.powershell, io);
  }

  if (manifest.signal) {
    checkLegacyPath(errors, dir, 'signal.alertModule', manifest.signal.alertModule, io);
  }

  if (manifest.investigation) {
    checkLegacyPath(errors, dir, 'investigation.query', manifest.investigation.query, io);
  }

  return errors;
}

const validate = makeLegacyValidator();
const quietSuccess = process.argv.slice(2).includes('--quiet-success');
let failed = false;
const fail = (msg) => { console.error(`✖ ${msg}`); failed = true; };

for (const track of legacyListTracks()) {
  const scenarios = legacyScenarioDirs(track).map((dir) => legacyLoadScenario(dir, track));
  const seenActions = new Map();

  for (const s of scenarios) {
    if (!validate(s.manifest)) {
      for (const e of validate.errors) fail(`${track}/${s.id}: schema ${e.instancePath || '/'} ${e.message}`);
      continue;
    }
    for (const e of checkLegacyScenario(s, { fileExists, isExecutable })) fail(`${track}/${s.id}: ${e}`);

    for (const action of s.manifest.remediate ?? []) {
      if (!seenActions.has(action.action)) seenActions.set(action.action, []);
      seenActions.get(action.action).push(s.id);
    }
  }

  for (const [action, ids] of seenActions.entries()) {
    if (ids.length > 1) {
      fail(`${track}: remediation action "${action}" is defined by multiple scenarios (${ids.join(', ')}); action names must be unique per track`);
    }
  }

  const trackDir = resolve(WORKSHOPS_DIR, track);

  const indexPath = resolve(trackDir, 'scenarios', 'INDEX.md');
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== legacyRenderIndex(track, scenarios)) {
    fail(`${track}: scenarios/INDEX.md is stale — run scripts/validate-scenarios.sh --write`);
  }

  const modulesDir = resolve(trackDir, 'infra', 'bicep', 'modules');
  if (existsSync(modulesDir)) {
    const aggPath = resolve(modulesDir, 'scenario-alerts.bicep');
    if (!existsSync(aggPath) || readFileSync(aggPath, 'utf8') !== legacyRenderAggregator(track, scenarios)) {
      fail(`${track}: modules/scenario-alerts.bicep is stale — run scripts/validate-scenarios.sh --write`);
    }
  }

  const readmePath = resolve(trackDir, 'README.md');
  if (existsSync(readmePath)) {
    const src = readFileSync(readmePath, 'utf8');
    const re = new RegExp(`${LEGACY_README_BEGIN}[\\s\\S]*?${LEGACY_README_END}`);
    const m = src.match(re);
    if (m && m[0] !== legacyRenderReadmeBlock(scenarios).trimEnd()) {
      fail(`${track}: README scenario table is stale — run scripts/validate-scenarios.sh --write`);
    }
  }
}

if (failed) { console.error('\nScenario validation FAILED'); process.exit(1); }
if (!quietSuccess) console.log('Scenario validation passed');
