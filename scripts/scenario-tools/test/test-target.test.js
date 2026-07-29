import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeclaredTestTarget } from '../lib/scenario-test-target.js';

const scenario = {
  dir: '/repo/scenarios/cpu-runaway',
  manifest: { tests: 'tests' },
};

function filesystem({ files = [], realpaths = {} } = {}) {
  return {
    fileExists: (path) => files.includes(path),
    realpath: (path) => realpaths[path] ?? path,
  };
}

test('resolves a declared test directory inside its scenario', () => {
  const target = resolveDeclaredTestTarget(
    scenario,
    filesystem({ files: ['/repo/scenarios/cpu-runaway/tests'] })
  );

  assert.equal(target, '/repo/scenarios/cpu-runaway/tests');
});

test('returns null when a scenario declares no tests', () => {
  const target = resolveDeclaredTestTarget(
    { ...scenario, manifest: {} },
    filesystem()
  );

  assert.equal(target, null);
});

test('rejects absolute and missing test paths', () => {
  assert.throws(
    () =>
      resolveDeclaredTestTarget(
        { ...scenario, manifest: { tests: '/outside/tests' } },
        filesystem()
      ),
    /must stay inside/
  );

  assert.throws(
    () => resolveDeclaredTestTarget(scenario, filesystem()),
    /references missing file tests/
  );
});

test('rejects paths and symlinks that leave the scenario directory', () => {
  assert.throws(
    () =>
      resolveDeclaredTestTarget(
        { ...scenario, manifest: { tests: '../other/tests' } },
        filesystem({ files: ['/repo/scenarios/other/tests'] })
      ),
    /must stay inside/
  );

  assert.throws(
    () =>
      resolveDeclaredTestTarget(
        scenario,
        filesystem({
          files: ['/repo/scenarios/cpu-runaway/tests'],
          realpaths: {
            '/repo/scenarios/cpu-runaway/tests': '/outside/tests',
          },
        })
      ),
    /must stay inside/
  );
});
