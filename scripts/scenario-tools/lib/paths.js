import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// lib/ -> scenario-tools/ -> scripts/ -> repo root
export const REPO_ROOT = resolve(here, '..', '..', '..');
export const SCENARIOS_DIR = resolve(REPO_ROOT, 'scenarios');
export const ROOT_README = resolve(REPO_ROOT, 'README.md');
