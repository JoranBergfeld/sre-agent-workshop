import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT_README } from '../lib/paths.js';
import { loadAllScenarios } from '../lib/scenarios.js';
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

const validate = makeValidator();
const scenarios = loadAllScenarios();
let failed = false;
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  failed = true;
};

for (const scenario of scenarios) {
  if (!validate(scenario.manifest)) {
    for (const error of validate.errors) {
      fail(`${scenario.id}: schema ${error.instancePath || '/'} ${error.message}`);
    }
    continue;
  }

  for (const error of checkScenario(scenario, { fileExists, isExecutable })) {
    fail(`${scenario.id}: ${error}`);
  }

  for (const action of findDuplicateActions(scenario.manifest)) {
    fail(`${scenario.id}: remediation action "${action}" is defined more than once within the manifest`);
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

console.log('Scenario validation passed');
