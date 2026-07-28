import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import yaml from 'js-yaml';
import { SCENARIOS_DIR, WORKSHOPS_DIR, TRACKS } from './paths.js';

export function scenarioDirs(root = SCENARIOS_DIR) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .map((name) => resolve(root, name))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory() && existsSync(resolve(dir, 'scenario.yaml'));
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

export function legacyListTracks() {
  return Object.keys(TRACKS).filter((track) => existsSync(resolve(WORKSHOPS_DIR, track, 'scenarios')));
}

export function legacyScenarioDirs(track) {
  return scenarioDirs(resolve(WORKSHOPS_DIR, track, 'scenarios'));
}

export function legacyLoadScenario(dir, track) {
  return { track, ...loadScenario(dir) };
}

export function legacyLoadAllScenarios() {
  return legacyListTracks().flatMap((track) =>
    legacyScenarioDirs(track).map((dir) => legacyLoadScenario(dir, track))
  );
}
