import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, WORKSHOPS_DIR } from '../lib/paths.js';
import { legacyListTracks, legacyScenarioDirs, legacyLoadScenario } from '../lib/scenarios.js';
import { makeLegacyValidator, checkScenario, findDuplicateActions } from '../lib/validate.js';
import { LEGACY_README_BEGIN, LEGACY_README_END, legacyRenderIndex, legacyRenderAggregator, legacyRenderReadmeBlock } from '../lib/legacy-generate.js';
import { loadAllScenarios } from '../lib/scenarios.js';
import { extractCatalogBlock, renderCatalog } from '../lib/generate.js';

const fileExists = (p) => existsSync(p);
const isExecutable = (p) => {
  try { return (statSync(p).mode & 0o111) !== 0; } catch { return false; }
};

// Framework Task 4 switches top-level capsules to makeValidator and removes
// legacy compatibility. Keep this bridge until the migration lands.
const validate = makeLegacyValidator();
let failed = false;
const fail = (msg) => { console.error(`✖ ${msg}`); failed = true; };

for (const track of legacyListTracks()) {
  const scenarios = legacyScenarioDirs(track).map((dir) => legacyLoadScenario(dir, track));

  for (const s of scenarios) {
    if (!validate(s.manifest)) {
      for (const e of validate.errors) fail(`${track}/${s.id}: schema ${e.instancePath || '/'} ${e.message}`);
      continue;
    }
    for (const e of checkScenario(s, { fileExists, isExecutable })) fail(`${track}/${s.id}: ${e}`);
  }

  for (const dup of findDuplicateActions(scenarios)) {
    fail(`${track}: remediation action "${dup.action}" is defined by multiple scenarios (${dup.ids.join(', ')}); action names must be unique per track`);
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

const rootReadme = resolve(REPO_ROOT, 'README.md');
if (existsSync(rootReadme)) {
  const rootScenarios = loadAllScenarios();
  const src = readFileSync(rootReadme, 'utf8');
  try {
    const block = extractCatalogBlock(src);
    if (block !== renderCatalog(rootScenarios).trimEnd()) {
      fail(`root: README scenario catalog is stale — run scripts/validate-scenarios.sh --write`);
    }
  } catch (error) {
    fail(`root: README scenario catalog ${error.message}`);
  }
}

if (failed) { console.error('\nScenario validation FAILED'); process.exit(1); }
console.log('Scenario validation passed');
