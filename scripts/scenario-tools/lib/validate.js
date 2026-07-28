import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { REPO_ROOT } from './paths.js';

function compileSchema(fileName) {
  const schema = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'schemas', fileName), 'utf8')
  );
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function makeValidator() {
  return compileSchema('scenario.schema.json');
}

export function makeLegacyValidator() {
  return compileSchema('legacy-scenario.schema.json');
}

// Pure cross-field validation. `fileExists` and `isExecutable` are injected so
// the logic is testable without touching the filesystem. Executable checks
// apply only to `.sh` scripts.
export function checkScenario({ track, id, manifest, dir }, { fileExists, isExecutable = () => true }) {
  const errors = [];

  if (manifest.id !== id) errors.push(`id "${manifest.id}" must equal folder name "${id}"`);
  if (manifest.track !== track) errors.push(`track "${manifest.track}" must equal parent track "${track}"`);

  for (const f of ['scenario.yaml', manifest.docPage].filter(Boolean)) {
    if (!fileExists(resolve(dir, f))) errors.push(`missing required file ${f}`);
  }

  const checkScript = (label, f) => {
    if (!f) { errors.push(`${label} is required`); return; }
    if (!fileExists(resolve(dir, f))) { errors.push(`${label} references missing file ${f}`); return; }
    if (f.endsWith('.sh') && !isExecutable(resolve(dir, f))) {
      errors.push(`${label} ${f} must be executable (chmod +x)`);
    }
  };

  for (const kind of ['inject', 'validate']) {
    const pair = manifest[kind] ?? {};
    checkScript(`${kind}.bash`, pair.bash);
    checkScript(`${kind}.powershell`, pair.powershell);
  }

  for (const action of manifest.remediate ?? []) {
    checkScript(`remediate.${action.action}.bash`, action.bash);
    checkScript(`remediate.${action.action}.powershell`, action.powershell);
  }

  if (manifest.signal?.alertModule && !fileExists(resolve(dir, manifest.signal.alertModule))) {
    errors.push(`signal.alertModule references missing file ${manifest.signal.alertModule}`);
  }
  if (manifest.investigation?.query && !fileExists(resolve(dir, manifest.investigation.query))) {
    errors.push(`investigation.query references missing file ${manifest.investigation.query}`);
  }

  return errors;
}

// Approval-gate actions are resolved by globbing scenarios/*/<action>.sh, so an
// action name must be unique within a track. Returns [{action, ids}] for clashes.
export function findDuplicateActions(scenarios) {
  const byAction = new Map();
  for (const s of scenarios) {
    for (const r of s.manifest.remediate ?? []) {
      if (!byAction.has(r.action)) byAction.set(r.action, []);
      byAction.get(r.action).push(s.id);
    }
  }
  return [...byAction.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([action, ids]) => ({ action, ids }));
}
