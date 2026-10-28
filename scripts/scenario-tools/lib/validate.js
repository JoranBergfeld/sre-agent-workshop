import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
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

export const MANDATORY_PAGE_STAGES = [
  'prerequisites',
  'deploy-infrastructure',
  'onboard-sre-agent',
  'configure-incident-response',
  'run-observe-scenario',
  'cleanup',
];

function pathError(label) {
  return `${label} must stay inside the scenario directory`;
}

export function checkReferencedPath(
  errors,
  dir,
  label,
  rawPath,
  { fileExists, isExecutable = () => true, realpath = (path) => path, requireExecutable = false }
) {
  if (!rawPath) {
    errors.push(`${label} is required`);
    return;
  }

  if (isAbsolute(rawPath)) {
    errors.push(pathError(label));
    return;
  }

  const resolved = resolve(dir, rawPath);
  const lexicalRel = relative(dir, resolved);
  if (!lexicalRel || lexicalRel.startsWith('..') || isAbsolute(lexicalRel)) {
    errors.push(pathError(label));
    return;
  }
  if (!fileExists(resolved)) {
    errors.push(`${label} references missing file ${rawPath}`);
    return;
  }

  let canonicalDir;
  let canonicalResolved;
  try {
    canonicalDir = realpath(dir);
    canonicalResolved = realpath(resolved);
  } catch {
    errors.push(`${label} references missing file ${rawPath}`);
    return;
  }

  const rel = relative(canonicalDir, canonicalResolved);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    errors.push(pathError(label));
    return;
  }

  if (requireExecutable && !isExecutable(resolved)) {
    errors.push(`${label} ${rawPath} must be executable (chmod +x)`);
  }
}

function guidePageLinks(content, guidePath, scenarioDir) {
  const links = [];
  const pattern = /(?<!!)\[[^\]]*]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g;
  for (const match of content.matchAll(pattern)) {
    const target = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const path = target.split(/[?#]/, 1)[0];
    if (!path) continue;
    const resolved = resolve(scenarioDir, dirname(guidePath), path);
    const local = relative(scenarioDir, resolved);
    if (!local || local.startsWith('..') || isAbsolute(local)) continue;
    links.push(local);
  }
  return links;
}

export function checkPageFlow(
  { manifest, dir },
  { fileExists, realpath = (path) => path, readFile }
) {
  const errors = [];
  if (!manifest.pages) return errors;
  const pages = manifest.pages ?? [];
  const stages = [];
  const stageCounts = new Map();
  const pathCounts = new Map();

  for (const page of pages) {
    const label = `pages.${page.stage ?? 'optional'}`;
    checkReferencedPath(errors, dir, label, page.path, { fileExists, realpath });
    if (page.path && extname(page.path).toLowerCase() !== '.md') {
      errors.push(`${label} must reference a Markdown file`);
    }

    pathCounts.set(page.path, (pathCounts.get(page.path) ?? 0) + 1);
    if (page.stage) {
      stages.push(page.stage);
      stageCounts.set(page.stage, (stageCounts.get(page.stage) ?? 0) + 1);
    }
  }

  for (const stage of MANDATORY_PAGE_STAGES) {
    const count = stageCounts.get(stage) ?? 0;
    if (count === 0) errors.push(`pages missing mandatory stage ${stage}`);
    if (count > 1) errors.push(`pages stage ${stage} is declared more than once`);
  }

  for (const [path, count] of pathCounts) {
    if (path && count > 1) errors.push(`pages path ${path} is declared more than once`);
  }

  const stageRanks = stages
    .filter((stage) => MANDATORY_PAGE_STAGES.includes(stage))
    .map((stage) => MANDATORY_PAGE_STAGES.indexOf(stage));
  if (stageRanks.some((rank, index) => index > 0 && rank < stageRanks[index - 1])) {
    errors.push('pages mandatory stages must follow canonical order');
  }

  if (!readFile || !manifest.guide || !fileExists(resolve(dir, manifest.guide))) return errors;

  let content;
  try {
    content = String(readFile(resolve(dir, manifest.guide)));
  } catch {
    return errors;
  }

  const links = guidePageLinks(content, manifest.guide, dir);
  const declaredPaths = pages.map((page) => page.path);
  for (const link of new Set(links)) {
    if (link.startsWith('docs/') && extname(link).toLowerCase() === '.md' && !declaredPaths.includes(link)) {
      errors.push(`guide links undeclared scenario page ${link}`);
    }
  }
  const positions = [];
  for (const path of declaredPaths) {
    const matches = links
      .map((link, index) => (link === path ? index : -1))
      .filter((index) => index >= 0);
    if (matches.length === 0) errors.push(`guide does not link declared page ${path}`);
    if (matches.length > 1) errors.push(`guide links declared page ${path} more than once`);
    if (matches.length > 0) positions.push(matches[0]);
  }
  if (
    positions.length === declaredPaths.length &&
    positions.some((position, index) => index > 0 && position < positions[index - 1])
  ) {
    errors.push('guide page order differs from scenario.yaml');
  }

  return errors;
}

// Pure cross-field validation. `fileExists` and `isExecutable` are injected so
// the logic is testable without touching the filesystem. Executable checks
// apply only to fields explicitly marked as Bash scripts.
export function checkScenario({ id, manifest, dir }, { fileExists, isExecutable = () => true, realpath = (path) => path }) {
  const errors = [];

  if (manifest.id !== id) errors.push(`id "${manifest.id}" must equal folder name "${id}"`);

  if (!fileExists(resolve(dir, 'scenario.yaml'))) {
    errors.push('missing required file scenario.yaml');
  }

  checkReferencedPath(errors, dir, 'guide', manifest.guide, { fileExists, isExecutable, realpath });

  for (const kind of ['setup', 'inject', 'validate', 'cleanup']) {
    const pair = manifest[kind] ?? {};
    checkReferencedPath(errors, dir, `${kind}.bash`, pair.bash, {
      fileExists,
      isExecutable,
      realpath,
      requireExecutable: true,
    });
    checkReferencedPath(errors, dir, `${kind}.powershell`, pair.powershell, { fileExists, isExecutable, realpath });
  }

  for (const action of manifest.remediate ?? []) {
    checkReferencedPath(errors, dir, `remediate.${action.action}.bash`, action.bash, {
      fileExists,
      isExecutable,
      realpath,
      requireExecutable: true,
    });
    checkReferencedPath(errors, dir, `remediate.${action.action}.powershell`, action.powershell, {
      fileExists,
      isExecutable,
      realpath,
    });
  }

  if (manifest.signal) {
    checkReferencedPath(errors, dir, 'signal.alertModule', manifest.signal.alertModule, {
      fileExists,
      isExecutable,
      realpath,
    });
  }

  if (manifest.investigation) {
    checkReferencedPath(errors, dir, 'investigation.query', manifest.investigation.query, {
      fileExists,
      isExecutable,
      realpath,
    });
  }

  if (manifest.source) {
    checkReferencedPath(errors, dir, 'source', manifest.source, { fileExists, isExecutable, realpath });
  }

  if (manifest.tests) {
    checkReferencedPath(errors, dir, 'tests', manifest.tests, { fileExists, isExecutable, realpath });
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
