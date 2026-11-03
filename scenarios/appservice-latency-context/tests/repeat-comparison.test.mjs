import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const capsule = new URL('../', import.meta.url);
const repeatPage = new URL('docs/08-repeat-compare.md', capsule);

test('learners reach a repeatable second incident only after customization and isolated security', async () => {
  const guide = await readFile(new URL('README.md', capsule), 'utf8');
  const journey = [...guide.matchAll(/^\d+\. \[[^\]]+\]\(([^)]+)\)/gm)].map((match) => match[1]);
  const required = [
    'docs/04-baseline.md', 'docs/05-sre-context.md', 'docs/06-handover-context.md',
    'docs/07-review-security.md', 'docs/08-repeat-compare.md', 'docs/99-cleanup.md',
  ];
  assert.deepEqual(journey.filter((page) => required.includes(page)), required);
  assert.doesNotMatch(guide, /Checkpoint placeholders|being completed in #/);
  const repeat = await readFile(repeatPage, 'utf8');
  assert.match(repeat, /baseline fix[\s\S]*unmerged/i);
  assert.match(repeat, /fresh thread on the same SRE Agent/);
  assert.match(repeat, /fresh coding-agent task/);
  assert.match(repeat, /git diff[\s\S]*src[\s\S]*tests/);
  assert.match(repeat, /initiating prompt[\s\S]*permissions[\s\S]*test conditions/i);
  assert.match(repeat, /I approve creating exactly one unassigned incident issue/);
  assert.match(repeat, /identity audience[\s\S]*ARM[\s\S]*Log Analytics/);
  for (const [, target] of repeat.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (!/^[a-z]+:/i.test(target)) await access(new URL(target, repeatPage));
  }
});

test('comparison keeps native accounting, missing evidence and deployed recovery distinct', async () => {
  const repeat = await readFile(repeatPage, 'utf8');
  assert.match(repeat, /\| SRE incident pass \| Input tokens; output tokens/);
  assert.match(repeat, /\| GitHub incident pass \| Per-session AI credits/);
  assert.match(repeat, /\| Setup\/customization \|/);
  assert.match(repeat, /\| Review\/security \|/);
  assert.match(repeat, /final cumulative[\s\S]*not[\s\S]*snapshots/i);
  assert.match(repeat, /already includes delegated work[\s\S]*do not add/i);
  assert.match(repeat, /unmeasured\/inconclusive/);
  assert.match(repeat, /occupancy[\s\S]*cached tokens[\s\S]*AAUs[\s\S]*monetary cost/);
  assert.match(repeat, /prior exposure[\s\S]*memory[\s\S]*cache[\s\S]*model/i);
  assert.match(repeat, /independent\s+deployed-runtime verification/);
  assert.match(repeat, /tests nor reset prove deployed recovery/);
  const checkpoints = repeat.split(/^## Checkpoint /m).slice(1);
  assert.equal(checkpoints.length, 4);
  for (const checkpoint of checkpoints) {
    for (const label of ['Objective', 'Starting assets', 'Explanation', 'Observe', 'Experiment', 'Troubleshooting']) {
      assert.match(checkpoint, new RegExp(`\\*\\*${label}:\\*\\*`));
    }
    assert.match(checkpoint, /<details>\s*<summary>Show exact steps<\/summary>/);
    assert.doesNotMatch(checkpoint, /<details\s+open\b/);
  }
  const proceduralHelp = [...repeat.matchAll(/<summary>Show exact steps<\/summary>([\s\S]*?)<\/details>/g)]
    .map((match) => match[1]).join('\n');
  assert.doesNotMatch(proceduralHelp, /sleep\(|usleep\(/);
  assert.match(repeat, /<details>\s*<summary>Spoiler: /);
});
