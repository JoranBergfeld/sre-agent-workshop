import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadAllScenarios } from '../lib/scenarios.js';
import { ROOT_README } from '../lib/paths.js';
import { CATALOG_BEGIN, CATALOG_END, renderCatalog } from '../lib/generate.js';

const scenarios = loadAllScenarios();
const block = renderCatalog(scenarios);

if (existsSync(ROOT_README)) {
  const src = readFileSync(ROOT_README, 'utf8');
  const re = new RegExp(`${CATALOG_BEGIN}[\\s\\S]*?${CATALOG_END}`);
  if (!re.test(src)) {
    throw new Error('Root README is missing scenario catalog markers');
  }
  writeFileSync(ROOT_README, src.replace(re, block));
}

console.log(`generated root catalog: ${scenarios.length} scenario(s)`);
