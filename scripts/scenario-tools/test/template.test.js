import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { makeLegacyValidator, checkScenario } from '../lib/validate.js';

function materialize(track, id) {
  const tmp = mkdtempSync(resolve(tmpdir(), 'scn-'));
  const dest = resolve(tmp, id);
  cpSync(resolve(import.meta.dirname, '..', 'template'), dest, { recursive: true });
  const tokens = { __SCENARIO_ID__: id, __TRACK__: track, __SCENARIO_TITLE__: 'Example' };
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = resolve(d, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      let t = readFileSync(p, 'utf8');
      for (const [k, v] of Object.entries(tokens)) t = t.split(k).join(v);
      writeFileSync(p, t);
    }
  };
  walk(dest);
  return dest;
}

test('template passes schema and cross-field checks after substitution', () => {
  const dir = materialize('vm', 'example');
  const manifest = yaml.load(readFileSync(resolve(dir, 'scenario.yaml'), 'utf8'));
  // Framework Task 5 migrates the template to the capsule schema.
  const validate = makeLegacyValidator();
  assert.ok(validate(manifest), JSON.stringify(validate.errors));
  const errs = checkScenario(
    { track: 'vm', id: basename(dir), manifest, dir },
    { fileExists: (p) => existsSync(p), isExecutable: () => true }
  );
  assert.deepEqual(errs, []);
});
