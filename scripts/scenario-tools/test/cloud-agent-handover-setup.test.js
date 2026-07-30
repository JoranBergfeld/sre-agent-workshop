import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

test('Cloud Agent Handover setup ignores injected GitHub integration tokens', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );
  const powershellSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.ps1'),
    'utf8'
  );

  assert.match(bashSetup, /unset GH_TOKEN GITHUB_TOKEN/);
  assert.match(powershellSetup, /Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN/);
});

test('Cloud Agent Handover onboarding makes manual SRE Agent creation explicit', () => {
  const onboardingGuide = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md'),
    'utf8'
  );

  assert.match(onboardingGuide, /does \*\*not\*\*\s+deploy an SRE Agent/i);
  assert.match(onboardingGuide, /Create an SRE Agent manually/i);
});
