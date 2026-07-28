import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
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

function pathError(label) {
  return `${label} must stay inside the scenario directory`;
}

function checkReferencedPath(errors, dir, label, rawPath, { fileExists, isExecutable = () => true }) {
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

  if (rawPath.endsWith('.sh') && !isExecutable(resolved)) {
    errors.push(`${label} ${rawPath} must be executable (chmod +x)`);
  }
}

// Pure cross-field validation. `fileExists` and `isExecutable` are injected so
// the logic is testable without touching the filesystem. Executable checks
// apply only to `.sh` scripts.
export function checkScenario({ id, manifest, dir }, { fileExists, isExecutable = () => true }) {
  const errors = [];

  if (manifest.id !== id) errors.push(`id "${manifest.id}" must equal folder name "${id}"`);

  if (!fileExists(resolve(dir, 'scenario.yaml'))) {
    errors.push('missing required file scenario.yaml');
  }

  checkReferencedPath(errors, dir, 'guide', manifest.guide, { fileExists, isExecutable });

  for (const kind of ['setup', 'inject', 'validate', 'cleanup']) {
    const pair = manifest[kind] ?? {};
    checkReferencedPath(errors, dir, `${kind}.bash`, pair.bash, { fileExists, isExecutable });
    checkReferencedPath(errors, dir, `${kind}.powershell`, pair.powershell, { fileExists, isExecutable });
  }

  for (const action of manifest.remediate ?? []) {
    checkReferencedPath(errors, dir, `remediate.${action.action}.bash`, action.bash, { fileExists, isExecutable });
    checkReferencedPath(errors, dir, `remediate.${action.action}.powershell`, action.powershell, { fileExists, isExecutable });
  }

  if (manifest.signal) {
    checkReferencedPath(errors, dir, 'signal.alertModule', manifest.signal.alertModule, { fileExists, isExecutable });
  }

  if (manifest.investigation) {
    checkReferencedPath(errors, dir, 'investigation.query', manifest.investigation.query, { fileExists, isExecutable });
  }

  if (manifest.source) {
    checkReferencedPath(errors, dir, 'source', manifest.source, { fileExists, isExecutable });
  }

  if (manifest.tests) {
    checkReferencedPath(errors, dir, 'tests', manifest.tests, { fileExists, isExecutable });
  }

  return errors;
}

export function findDuplicateActions(manifest) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of manifest.remediate ?? []) {
    if (seen.has(item.action)) duplicates.add(item.action);
    seen.add(item.action);
  }
  return [...duplicates].sort();
}
