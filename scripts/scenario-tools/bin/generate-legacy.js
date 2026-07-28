import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSHOPS_DIR } from '../lib/paths.js';
import { legacyListTracks, legacyScenarioDirs, legacyLoadScenario } from '../lib/scenarios.js';
import { legacyRenderIndex, legacyRenderAggregator, legacyRenderReadmeBlock, LEGACY_README_BEGIN, LEGACY_README_END } from '../lib/legacy-generate.js';

function writeReadmeBlock(readmePath, block) {
  if (!existsSync(readmePath)) return;
  const src = readFileSync(readmePath, 'utf8');
  const re = new RegExp(`${LEGACY_README_BEGIN}[\\s\\S]*?${LEGACY_README_END}`);
  if (!re.test(src)) return;
  writeFileSync(readmePath, src.replace(re, block.trimEnd()));
}

for (const track of legacyListTracks()) {
  const scenarios = legacyScenarioDirs(track).map((dir) => legacyLoadScenario(dir, track));
  const trackDir = resolve(WORKSHOPS_DIR, track);

  writeFileSync(resolve(trackDir, 'scenarios', 'INDEX.md'), legacyRenderIndex(track, scenarios));

  const modulesDir = resolve(trackDir, 'infra', 'bicep', 'modules');
  if (existsSync(modulesDir)) {
    writeFileSync(resolve(modulesDir, 'scenario-alerts.bicep'), legacyRenderAggregator(track, scenarios));
  }

  writeReadmeBlock(resolve(trackDir, 'README.md'), legacyRenderReadmeBlock(scenarios));
  console.log(`generated legacy ${track}: ${scenarios.length} scenario(s)`);
}
