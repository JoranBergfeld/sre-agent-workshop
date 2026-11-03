import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { packageApp } from '../scripts/package.mjs';

const capsule = fileURLToPath(new URL('../', import.meta.url));

test('repaired lookup preserves exact synthetic order IDs through the PDO boundary without a database', () => {
  const result = spawnSync('php', ['security/verify.php', 'security/reference/order-status.php'], {
    cwd: capsule, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ordinary, missing, quoted, SQL-shaped, non-string/);
});

test('the learner starter fails the same verifier before repair', () => {
  const result = spawnSync('php', ['security/verify.php', 'security/starter/order-status.php'], {
    cwd: capsule, encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /Unsafe direct SQL query/);
});

test('all supported deployment artifacts exclude the security exercise', async () => {
  const directory = path.join(capsule, '.test-runs', `security-${process.pid}`);
  await mkdir(directory, { recursive: true });
  try {
    for (const revision of ['healthy', 'faulty', 'reviewed']) {
      const archive = path.join(directory, `${revision}.zip`);
      await writeFile(archive, await packageApp(capsule, revision));
      const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
      assert.equal(listing.status, 0, listing.stderr);
      assert.deepEqual(listing.stdout.trim().split('\n').sort(), [
        'deployment.json', 'index.php', 'nginx.conf', 'telemetry.php', 'timing.php',
      ]);
      const contents = spawnSync('unzip', ['-p', archive], { encoding: 'utf8' });
      assert.equal(contents.status, 0, contents.stderr);
      assert.doesNotMatch(contents.stdout, /lookupOrderStatus|security\/|context\/review/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the review checkpoint provides working local asset navigation without expanded spoilers', async () => {
  const guide = path.join(capsule, 'docs/07-review-security.md');
  const text = await readFile(guide, 'utf8');
  const links = [...text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)]
    .map((match) => match[1]).filter((link) => !link.startsWith('https://'));
  assert.ok(links.some((link) => link.startsWith('../security/')), 'fixture assets must be reachable');
  assert.ok(links.some((link) => link.startsWith('../context/review/')), 'inactive review starters must be reachable');
  for (const link of links) await readFile(path.resolve(path.dirname(guide), link));
  assert.match(text, /<summary>Show exact steps<\/summary>/);
  assert.match(text, /<summary>Spoiler: repair and reference evidence<\/summary>/);
  assert.doesNotMatch(text, /<details[^>]+\bopen\b/);
});
