import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import yaml from 'js-yaml';
import { ROOT_README } from '../lib/paths.js';
import { scenarioCandidateDirs } from '../lib/scenarios.js';
import { makeValidator, checkScenario, findDuplicateActions } from '../lib/validate.js';
import { extractCatalogBlock, renderCatalog } from '../lib/generate.js';

const fileExists = (p) => existsSync(p);
const isExecutable = (p) => {
  try {
    return (statSync(p).mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

const quietSuccess = process.argv.slice(2).includes('--quiet-success');
const validate = makeValidator();
const scenarios = [];
let failed = false;
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  failed = true;
};

for (const dir of scenarioCandidateDirs()) {
  const id = basename(dir);
  const manifestPath = resolve(dir, 'scenario.yaml');
  if (!existsSync(manifestPath)) {
    fail(`${id}: missing required file scenario.yaml`);
    continue;
  }

  let manifest;
  try {
    manifest = yaml.load(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`${id}: invalid scenario.yaml: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const scenario = { id, dir, manifest };

  if (!validate(scenario.manifest)) {
    for (const error of validate.errors) {
      fail(`${scenario.id}: schema ${error.instancePath || '/'} ${error.message}`);
    }
    continue;
  }

  let isValidScenario = true;

  for (const error of checkScenario(scenario, { fileExists, isExecutable, realpath: realpathSync })) {
    fail(`${scenario.id}: ${error}`);
    isValidScenario = false;
  }

  for (const action of findDuplicateActions(scenario.manifest)) {
    fail(`${scenario.id}: remediation action "${action}" is defined more than once within the manifest`);
    isValidScenario = false;
  }

  if (isValidScenario) {
    scenarios.push(scenario);
  }
}

if (existsSync(ROOT_README)) {
  const src = readFileSync(resolve(ROOT_README), 'utf8');
  try {
    const block = extractCatalogBlock(src);
    const expected = renderCatalog(scenarios).trimEnd();
    if (block !== expected) {
      fail(`root: README scenario catalog is stale — run scripts/validate-scenarios.sh --write`);
    }
  } catch (error) {
    fail(`root: README scenario catalog ${error.message}`);
  }
}

if (failed) {
  console.error('\nScenario validation FAILED');
  process.exit(1);
}

if (!quietSuccess) {
  console.log('Scenario validation passed');
}
