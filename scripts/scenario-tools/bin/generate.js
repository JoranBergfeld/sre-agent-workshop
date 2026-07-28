import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSHOPS_DIR } from '../lib/paths.js';
import { legacyListTracks, legacyScenarioDirs, legacyLoadScenario } from '../lib/scenarios.js';
import { renderIndex, renderAggregator, renderReadmeBlock, README_BEGIN, README_END } from '../lib/generate.js';

function writeReadmeBlock(readmePath, block) {
  if (!existsSync(readmePath)) return;
  const src = readFileSync(readmePath, 'utf8');
  const re = new RegExp(`${README_BEGIN}[\\s\\S]*?${README_END}`);
  if (!re.test(src)) return;
  writeFileSync(readmePath, src.replace(re, block.trimEnd()));
}

for (const track of legacyListTracks()) {
  const scenarios = legacyScenarioDirs(track).map((dir) => legacyLoadScenario(dir, track));
  const trackDir = resolve(WORKSHOPS_DIR, track);

  writeFileSync(resolve(trackDir, 'scenarios', 'INDEX.md'), renderIndex(track, scenarios));

  const modulesDir = resolve(trackDir, 'infra', 'bicep', 'modules');
  if (existsSync(modulesDir)) {
    writeFileSync(resolve(modulesDir, 'scenario-alerts.bicep'), renderAggregator(track, scenarios));
  }

  writeReadmeBlock(resolve(trackDir, 'README.md'), renderReadmeBlock(scenarios));
  console.log(`generated ${track}: ${scenarios.length} scenario(s)`);
}
