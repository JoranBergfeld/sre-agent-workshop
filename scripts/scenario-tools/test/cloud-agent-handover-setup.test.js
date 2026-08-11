import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

test('Cloud Agent Handover setup retains the authenticated GitHub environment token', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );
  const powershellSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.ps1'),
    'utf8'
  );

  assert.doesNotMatch(bashSetup, /unset GH_TOKEN GITHUB_TOKEN/);
  assert.doesNotMatch(powershellSetup, /Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN/);
});

test('Cloud Agent Handover setup persists the verified Azure subscription', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );

  assert.match(bashSetup, /SUBSCRIPTION_ID="\$active_subscription_id"/);
  assert.doesNotMatch(bashSetup, /AZURE_ACTIVE_SUBSCRIPTION_ID/);
});

test('Cloud Agent Handover onboarding makes manual SRE Agent creation explicit', () => {
  const onboardingGuide = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/03-onboard-sre-agent.md'),
    'utf8'
  );

  assert.match(onboardingGuide, /does \*\*not\*\*\s+deploy an SRE Agent/i);
  assert.match(onboardingGuide, /Create an SRE Agent manually/i);
});

test('Cloud Agent Handover documentation retains the authenticated Codespaces token', () => {
  const rootReadme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8');
  const prerequisites = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/00-prerequisites.md'),
    'utf8'
  );
  const deploymentGuide = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/docs/01-deploy-infrastructure.md'),
    'utf8'
  );

  assert.match(rootReadme, /Codespaces' authenticated `GITHUB_TOKEN` is used by\s+`gh`/);
  assert.match(prerequisites, /setup uses the authenticated `GITHUB_TOKEN`/i);
  assert.match(deploymentGuide, /uses the active GitHub CLI credential/i);
  assert.doesNotMatch(rootReadme, /env -u GH_TOKEN -u GITHUB_TOKEN/);
  assert.doesNotMatch(prerequisites, /Remove-Item Env:GH_TOKEN, Env:GITHUB_TOKEN/);
});
