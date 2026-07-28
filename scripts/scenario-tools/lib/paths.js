import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// lib/ -> scenario-tools/ -> scripts/ -> repo root
export const REPO_ROOT = resolve(here, '..', '..', '..');
export const SCENARIOS_DIR = resolve(REPO_ROOT, 'scenarios');
export const ROOT_README = resolve(REPO_ROOT, 'README.md');

// Temporary legacy bridge for Task 4/5 while the CLI still validates the
// workshop track layout.
export const WORKSHOPS_DIR = resolve(REPO_ROOT, 'workshops');

// Temporary legacy bridge for Task 4/5 while the CLI still validates the
// workshop track layout.
export const TRACKS = {
  aks: { scopeParam: 'clusterId' },
  vm: { scopeParam: 'logAnalyticsResourceId' },
  appservice: { scopeParam: 'logAnalyticsResourceId' },
};
