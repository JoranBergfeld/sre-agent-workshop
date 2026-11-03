import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const capsule = fileURLToPath(new URL('../', import.meta.url));
for (const shell of ['bash', 'pwsh']) {
  test(`${shell}: coding branch preparation exposes faulty tracked code without overwriting learner edits`, async () => {
    const root = path.join(capsule, '.test-runs', `coding-${shell}-${process.pid}`);
    const target = path.join(root, 'scenarios/appservice-latency-context');
    await mkdir(target, { recursive: true });
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    const run = () => spawnSync(shell, [
      ...(shell === 'bash' ? [] : ['-NoProfile', '-File']),
      path.join(target, `scripts/prepare-code.${shell === 'bash' ? 'sh' : 'ps1'}`),
      '--confirm', 'faulty',
    ], { cwd: root, encoding: 'utf8' });
    try {
      for (const entry of ['scripts', 'src', 'tests/fixtures']) {
        await cp(path.join(capsule, entry), path.join(target, entry), { recursive: true });
      }
      git('init', '--initial-branch=main');
      git('-c', 'user.name=Lifecycle Test', '-c', 'user.email=test@example.invalid', 'add', '.');
      git('-c', 'user.name=Lifecycle Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'healthy foundation');
      assert.notEqual(run().status, 0, 'main must remain healthy');
      git('switch', '-c', 'incident-baseline');
      const prepared = run();
      assert.equal(prepared.status, 0, prepared.stderr);
      const timing = path.join(target, 'src/timing.php');
      assert.equal(await readFile(timing, 'utf8'), await readFile(path.join(target, 'tests/fixtures/timing-faulty.php'), 'utf8'));
      assert.match(git('diff', '--name-only'), /src\/timing.php/);
      assert.equal(run().status, 0, 'repeating preparation must be harmless');
      await writeFile(timing, '<?php // learner-owned change');
      assert.notEqual(run().status, 0);
      assert.equal(await readFile(timing, 'utf8'), '<?php // learner-owned change');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
