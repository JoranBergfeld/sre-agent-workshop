import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import yaml from 'js-yaml';
import { SCENARIOS_DIR } from './paths.js';

function directScenarioDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .map((name) => resolve(root, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

export function scenarioCandidateDirs(root = SCENARIOS_DIR) {
  return directScenarioDirs(root);
}

export function scenarioDirs(root = SCENARIOS_DIR) {
  return scenarioCandidateDirs(root)
    .filter((dir) => {
      try {
        return existsSync(resolve(dir, 'scenario.yaml'));
      } catch {
        return false;
      }
    })
    .sort();
}

export function loadScenario(dir) {
  const id = basename(dir);
  const manifest = yaml.load(readFileSync(resolve(dir, 'scenario.yaml'), 'utf8'));
  return { id, dir, manifest };
}

export function loadAllScenarios(root = SCENARIOS_DIR) {
  return scenarioDirs(root).map(loadScenario);
}
