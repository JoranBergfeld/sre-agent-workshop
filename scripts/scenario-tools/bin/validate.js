import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSHOPS_DIR } from '../lib/paths.js';
import { legacyListTracks, legacyScenarioDirs, legacyLoadScenario } from '../lib/scenarios.js';
import { makeLegacyValidator, checkScenario, findDuplicateActions } from '../lib/validate.js';
import { renderIndex, renderAggregator, renderReadmeBlock, README_BEGIN, README_END } from '../lib/generate.js';

const fileExists = (p) => existsSync(p);
const isExecutable = (p) => {
  try { return (statSync(p).mode & 0o111) !== 0; } catch { return false; }
};

// Framework Task 4 switches top-level capsules to makeValidator and removes legacy compatibility.
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
  if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== renderIndex(track, scenarios)) {
    fail(`${track}: scenarios/INDEX.md is stale — run scripts/validate-scenarios.sh --write`);
  }

  const modulesDir = resolve(trackDir, 'infra', 'bicep', 'modules');
  if (existsSync(modulesDir)) {
    const aggPath = resolve(modulesDir, 'scenario-alerts.bicep');
    if (!existsSync(aggPath) || readFileSync(aggPath, 'utf8') !== renderAggregator(track, scenarios)) {
      fail(`${track}: modules/scenario-alerts.bicep is stale — run scripts/validate-scenarios.sh --write`);
    }
  }

  const readmePath = resolve(trackDir, 'README.md');
  if (existsSync(readmePath)) {
    const src = readFileSync(readmePath, 'utf8');
    const re = new RegExp(`${README_BEGIN}[\\s\\S]*?${README_END}`);
    const m = src.match(re);
    if (m && m[0] !== renderReadmeBlock(scenarios).trimEnd()) {
      fail(`${track}: README scenario table is stale — run scripts/validate-scenarios.sh --write`);
    }
  }
}

if (failed) { console.error('\nScenario validation FAILED'); process.exit(1); }
console.log('Scenario validation passed');
