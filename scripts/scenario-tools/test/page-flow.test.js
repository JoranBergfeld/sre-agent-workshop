import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPageFlow } from '../lib/validate.js';

const mandatoryPages = [
  { stage: 'prerequisites', path: 'docs/00-prerequisites.md' },
  { stage: 'deploy-infrastructure', path: 'docs/01-deploy-infrastructure.md' },
  { stage: 'onboard-sre-agent', path: 'docs/03-onboard-sre-agent.md' },
  { stage: 'configure-incident-response', path: 'docs/04-configure-incident-response.md' },
  { stage: 'run-observe-scenario', path: 'docs/90-watch-sre-agent.md' },
  { stage: 'cleanup', path: 'docs/99-cleanup.md' },
];

const guide = mandatoryPages
  .map((page) => `- [${page.stage}](./${page.path})`)
  .join('\n');

const files = new Set(['README.md', ...mandatoryPages.map((page) => page.path)]);
const fileExists = (path) => files.has(path.replace('/scenario/', ''));
const realpath = (path) => path;
const readFile = () => guide;

function errorsFor(pages, content = guide) {
  return checkPageFlow(
    {
      id: 'example',
      dir: '/scenario',
      manifest: { guide: 'README.md', pages },
    },
    { fileExists, realpath, readFile: () => content }
  );
}

test('accepts the canonical mandatory page flow', () => {
  assert.deepEqual(errorsFor(mandatoryPages), []);
});

test('accepts optional pages anywhere in the flow', () => {
  const pages = [
    { optional: true, path: 'docs/intro.md' },
    ...mandatoryPages.slice(0, 2),
    { optional: true, path: 'docs/deploy-app.md' },
    ...mandatoryPages.slice(2),
    { optional: true, path: 'docs/appendix.md' },
  ];
  const content = pages.map((page) => `- [page](./${page.path})`).join('\n');
  const optionalFiles = pages.map((page) => page.path);

  assert.deepEqual(
    checkPageFlow(
      { id: 'example', dir: '/scenario', manifest: { guide: 'README.md', pages } },
      {
        fileExists: (path) => ['README.md', ...optionalFiles].includes(path.replace('/scenario/', '')),
        realpath,
        readFile: () => content,
      }
    ),
    []
  );
});

test('reports missing and out-of-order mandatory stages', () => {
  const pages = mandatoryPages
    .filter((page) => page.stage !== 'onboard-sre-agent')
    .map((page) => ({ ...page }));
  [pages[2], pages[3]] = [pages[3], pages[2]];

  const errors = errorsFor(pages, pages.map((page) => `- [page](./${page.path})`).join('\n'));

  assert.ok(errors.includes('pages missing mandatory stage onboard-sre-agent'));
  assert.ok(errors.some((error) => error.includes('mandatory stages must follow canonical order')));
});

test('reports duplicate stages and paths', () => {
  const pages = [
    ...mandatoryPages,
    { stage: 'cleanup', path: 'docs/99-cleanup-copy.md' },
    { optional: true, path: 'docs/99-cleanup.md' },
  ];

  const errors = errorsFor(pages, pages.map((page) => `- [page](./${page.path})`).join('\n'));

  assert.ok(errors.includes('pages stage cleanup is declared more than once'));
  assert.ok(errors.includes('pages path docs/99-cleanup.md is declared more than once'));
});

test('reports unsafe, missing, and non-Markdown page paths', () => {
  const pages = mandatoryPages.map((page) => ({ ...page }));
  pages[0].path = '../outside.md';
  pages[1].path = 'docs/missing.md';
  pages[2].path = 'docs/onboard.txt';

  const errors = errorsFor(pages, pages.map((page) => `- [page](${page.path})`).join('\n'));

  assert.ok(errors.includes('pages.prerequisites must stay inside the scenario directory'));
  assert.ok(errors.includes('pages.deploy-infrastructure references missing file docs/missing.md'));
  assert.ok(errors.includes('pages.onboard-sre-agent must reference a Markdown file'));
});

test('reports guide links that are missing, duplicated, or reordered', () => {
  const reordered = [
    mandatoryPages[1],
    mandatoryPages[0],
    ...mandatoryPages.slice(2),
  ];
  const content = [
    ...reordered.map((page) => `- [page](./${page.path})`),
    `- [duplicate](./${mandatoryPages[5].path})`,
  ].join('\n');

  const errors = errorsFor(mandatoryPages, content);

  assert.ok(errors.includes('guide links declared page docs/99-cleanup.md more than once'));
  assert.ok(errors.includes('guide page order differs from scenario.yaml'));
});

test('allows unrelated guide links outside the scenario docs flow', () => {
  const content = `${guide}\n- [Shared concepts](../../docs/00-what-is-sre-agent.md)\n`;
  assert.deepEqual(errorsFor(mandatoryPages, content), []);
});

test('requires scenario docs linked from the guide to be declared', () => {
  const content = `${guide}\n- [Extra module](./docs/50-extra.md)\n`;
  const errors = errorsFor(mandatoryPages, content);

  assert.ok(errors.includes('guide links undeclared scenario page docs/50-extra.md'));
});
