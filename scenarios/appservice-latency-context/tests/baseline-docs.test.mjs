import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const docs = new URL('../docs/', import.meta.url);
const pages = [
  '00-prerequisites.md', '02-onboard-sre-agent.md',
  '03-configure-incident-response.md', '04-baseline.md',
];

test('baseline learners can navigate and get optional procedural help at every checkpoint', async () => {
  for (const page of pages) {
    const markdown = await readFile(new URL(page, docs), 'utf8');
    for (const [, target] of markdown.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
      if (!/^[a-z]+:/i.test(target)) await access(new URL(target, new URL(page, docs)));
    }
  }
  const baseline = await readFile(new URL('04-baseline.md', docs), 'utf8');
  const checkpoints = baseline.split(/^## Checkpoint /m).slice(1);
  assert.equal(checkpoints.length, 5, 'cover preparation, investigation, handover, PR inspection and accounting');
  for (const checkpoint of checkpoints) {
    for (const label of ['Objective', 'Starting assets', 'Explanation', 'Experiment', 'Observe', 'Troubleshooting']) {
      assert.match(checkpoint, new RegExp(`\\*\\*${label}:\\*\\*`));
    }
    assert.match(checkpoint, /<details>\s*<summary>Show exact steps<\/summary>/);
    assert.doesNotMatch(checkpoint, /<details\s+open\b/);
  }
  assert.match(baseline, /<details>\s*<summary>Spoiler: /);
});

test('baseline accounting gives a thread-bounded native-token query and discloses missing counters', async () => {
  const baseline = await readFile(new URL('04-baseline.md', docs), 'utf8');
  const query = baseline.match(/```kql\n([\s\S]*?)```/)?.[1];
  assert.ok(query, 'learner can run an audit query without inventing fields or scope');
  assert.match(query, /timestamp between \(passStart \.\. passEnd\)/);
  assert.match(query, /ThreadId\) == thread/);
  assert.match(query, /EventType\) == "ModelGenerationEnd"/);
  assert.match(query, /InputTokens/);
  assert.match(query, /OutputTokens/);
  assert.match(query, /MissingCounters\s*=\s*countif/);
  assert.match(query, /by Thread, Agent, Model/);
  assert.match(baseline, /no rows[\s\S]*not zero/i);
  assert.match(baseline, /GitHub incident pass \| Per-session AI credits/);
  assert.match(baseline, /already[\s\S]*includes delegated work[\s\S]*do not add/i);
  assert.match(baseline, /unmeasured\/inconclusive/);
});

test('baseline access and handover instructions distinguish permissions and expose real faulty code', async () => {
  const prerequisites = await readFile(new URL('00-prerequisites.md', docs), 'utf8');
  assert.match(prerequisites, /SRE Agent Standard User/);
  assert.match(prerequisites, /SRE Agent Administrator/);
  assert.match(prerequisites, /agent's own Application\s+Insights/i);
  const onboarding = await readFile(new URL('02-onboard-sre-agent.md', docs), 'utf8');
  assert.match(onboarding, /Repository URL/);
  assert.match(onboarding, /no branch selector/i);
  const preparation = await readFile(new URL('03-configure-incident-response.md', docs), 'utf8');
  assert.match(preparation, /git switch -c incident-baseline [^\n]+/);
  assert.match(preparation, /git rev-parse HEAD/);
  const baseline = await readFile(new URL('04-baseline.md', docs), 'utf8');
  assert.match(baseline, /I approve creating exactly one unassigned incident issue/);
  assert.match(baseline, /Assignees → Copilot[\s\S]*starting branch[\s\S]*copilot-swe-agent/);
  assert.match(baseline, /--repo OWNER\/REPO --base incident-baseline/);
  assert.match(baseline, /Do not[\s\S]*both assign and run `create`/);
  assert.match(baseline, /Keep the baseline fix unmerged/);
  const root = new URL('../../../', docs);
  for (const page of pages) {
    const markdown = await readFile(new URL(page, docs), 'utf8');
    for (const [script] of markdown.matchAll(/scenarios\/[\w/-]+\.(?:sh|ps1|mjs)\b/g)) {
      await access(new URL(script, root));
    }
  }
});
