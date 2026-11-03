import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';

const capsule = new URL('../', import.meta.url);
const page = new URL('docs/06-handover-context.md', capsule);
const text = url => readFile(url, 'utf8');

async function linkedAsset(relative) {
  const document = await text(page);
  const links = [...document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
  const target = new URL(relative, capsule);
  assert.ok(links.some(link => new URL(link, page).href === target.href),
    `learner cannot reach ${relative} from handover guidance`);
  return text(target);
}

test('learner can draft an evidence-led issue without receiving a root-cause answer', async () => {
  const issue = await linkedAsset('context/handover/incident-issue.md.template');
  for (const field of [
    'Symptoms', 'Established facts', 'Hypotheses', 'Reproduction', 'Evidence',
    'Constraints', 'Verification',
  ]) {
    const section = issue.match(new RegExp(`(?:^|\\n)## ${field}\\n([\\s\\S]*?)(?=\\n## |$)`));
    assert.ok(section, `missing editable issue field: ${field}`);
    assert.match(section[1], /\[Fill:/, `${field} must be authored from the learner's run`);
  }
  assert.doesNotMatch(issue, /usleep|sleep\s*\(|timing-faulty\.php|seconds-based/i);
});

test('learner can author inactive repository and PHP instructions with bounded supported scope', async () => {
  const repository = await linkedAsset('context/coding/repository-instructions.md.template');
  const php = await linkedAsset('context/coding/php.instructions.md.template');
  assert.match(php, /^---\napplyTo: "scenarios\/appservice-latency-context\/src\/\*\*\/\*\.php"\nexcludeAgent: "code-review"\n---\n/);
  for (const instructions of [repository, php]) {
    for (const field of [
      'Navigation', 'Change boundary', 'Regression tests', 'Behavior preservation',
      'Validation report',
    ]) {
      const section = instructions.match(new RegExp(`(?:^|\\n)## ${field}\\n([\\s\\S]*?)(?=\\n## |$)`));
      assert.ok(section, `missing coding authoring field: ${field}`);
      assert.match(section[1], /\[Fill:/, `${field} needs learner decisions`);
    }
    assert.doesNotMatch(instructions, /usleep|sleep\s*\(|timing-faulty\.php|seconds-based/i);
  }
});

test('public handover route provides collapsed help, a separate answer reveal and working navigation', async () => {
  const document = await text(page);
  const checkpoints = document.split(/^## Checkpoint /m).slice(1);
  assert.ok(checkpoints.length > 0, 'handover must expose learner checkpoints');
  for (const checkpoint of checkpoints) {
    for (const field of [
      'Objective', 'Explanation', 'Starting assets', 'Experiment', 'Observations',
      'Troubleshooting',
    ]) {
      assert.match(checkpoint, new RegExp(`\\*\\*${field}(?:[: /])`),
        `checkpoint is missing ${field}`);
    }
    assert.match(checkpoint, /<details>\s*<summary>Show exact steps<\/summary>/);
  }
  const reveals = [...document.matchAll(/<details([^>]*)>\s*<summary>([^<]+)<\/summary>([\s\S]*?)<\/details>/g)];
  assert.ok(reveals.every(reveal => !/\bopen\b/i.test(reveal[1])),
    'procedural help and answers must initially be collapsed');
  const answer = reveals.find(reveal => /Spoiler:.*reference repair/i.test(reveal[2]));
  assert.ok(answer, 'root cause needs a separate reference reveal');
  assert.match(answer[3], /usleep/);
  const outsideReveals = document.replace(/<details[^>]*>[\s\S]*?<\/details>/g, '');
  assert.doesNotMatch(outsideReveals, /usleep|sleep\s*\(|seconds-based/i);
  for (const [, destination] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(destination)) continue;
    await access(new URL(destination.split('#')[0], page));
  }
  for (const destination of ['04-baseline.md', '05-sre-context.md', '07-review-security.md', '08-repeat-compare.md']) {
    assert.ok(document.includes(`](${destination})`), `missing journey link: ${destination}`);
  }
});
