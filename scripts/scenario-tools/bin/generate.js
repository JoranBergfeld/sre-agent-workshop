import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadAllScenarios } from '../lib/scenarios.js';
import { ROOT_README } from '../lib/paths.js';
import { renderCatalog, replaceCatalogBlock } from '../lib/generate.js';

const scenarios = loadAllScenarios();
const block = renderCatalog(scenarios);

if (existsSync(ROOT_README)) {
  const src = readFileSync(ROOT_README, 'utf8');
  writeFileSync(ROOT_README, replaceCatalogBlock(src, block));
}

console.log(`generated root catalog: ${scenarios.length} scenario(s)`);
