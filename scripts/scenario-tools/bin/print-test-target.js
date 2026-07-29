import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import yaml from 'js-yaml';
import { REPO_ROOT, SCENARIOS_DIR } from '../lib/paths.js';
import { resolveDeclaredTestTarget } from '../lib/scenario-test-target.js';

const manifestArgument = process.argv[2];
if (!manifestArgument) {
  console.error('Usage: print-test-target.js <scenario.yaml>');
  process.exit(2);
}

const manifestPath = resolve(REPO_ROOT, manifestArgument);
const scenarioDir = dirname(manifestPath);

try {
  if (basename(manifestPath) !== 'scenario.yaml') {
    throw new Error('Test target must be declared by scenario.yaml');
  }

  const canonicalScenariosDir = realpathSync(SCENARIOS_DIR);
  const canonicalScenarioDir = realpathSync(scenarioDir);
  if (dirname(canonicalScenarioDir) !== canonicalScenariosDir) {
    throw new Error('Scenario must be a top-level scenarios/<id> capsule');
  }

  const manifest = yaml.load(readFileSync(manifestPath, 'utf8'));
  const testTarget = resolveDeclaredTestTarget(
    { dir: scenarioDir, manifest },
    { fileExists: existsSync, realpath: realpathSync }
  );

  if (testTarget) {
    process.stdout.write(testTarget);
  }
} catch (error) {
  console.error(
    `Unable to resolve scenario tests for ${manifestArgument}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}
