import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

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

test('Cloud Agent Handover setup verifies the requested Azure subscription', () => {
  const bashSetup = readFileSync(
    resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts/setup.sh'),
    'utf8'
  );

  assert.match(bashSetup, /requested_subscription_id="\$\{AZURE_SUBSCRIPTION_ID:-\}"/);
  assert.match(bashSetup, /Azure subscription mismatch/);
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

test('Cloud Agent Handover deploy helpers deploy the verified artifact or an explicit local build through Azure CLI', () => {
  const bashPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.sh'
  );
  const powershellPath = resolve(
    repositoryRoot,
    'scenarios/cloud-agent-handover/scripts/deploy.ps1'
  );
  const bashDeploy = readFileSync(bashPath, 'utf8');
  const powershellDeploy = readFileSync(powershellPath, 'utf8');

  assert.notEqual(statSync(bashPath).mode & 0o111, 0);
  assert.match(bashDeploy, /scripts\/build-artifacts\/resolve\.mjs/);
  assert.match(powershellDeploy, /scripts\/build-artifacts\/resolve\.mjs/);
  assert.match(bashDeploy, /--local-build\)/);
  assert.match(powershellDeploy, /\[switch\]\$LocalBuild/);
  assert.match(bashDeploy, /dotnet test/);
  assert.match(bashDeploy, /dotnet publish/);
  assert.match(bashDeploy, /az webapp deploy/);
  assert.match(bashDeploy, /--type zip/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"test"/);
  assert.match(powershellDeploy, /"dotnet"[\s\S]*"publish"/);
  assert.match(powershellDeploy, /"webapp", "deploy"/);
  assert.match(powershellDeploy, /"--type", "zip"/);
  for (const script of [bashDeploy, powershellDeploy]) {
    assert.doesNotMatch(
      script,
      /\bgit\s+(?:fetch|pull|checkout|switch|merge|reset)\b/i
    );
  }
});

test('Cloud Agent Handover no longer provisions GitHub deployment credentials', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const mainBicep = readFileSync(
    resolve(scenarioRoot, 'infra/bicep/main.bicep'),
    'utf8'
  );
  const bashSetup = readFileSync(resolve(scenarioRoot, 'scripts/setup.sh'), 'utf8');
  const powershellSetup = readFileSync(
    resolve(scenarioRoot, 'scripts/setup.ps1'),
    'utf8'
  );

  assert.equal(
    existsSync(resolve(repositoryRoot, '.github/workflows/deploy-appservice-app.yml')),
    false
  );
  assert.equal(
    existsSync(resolve(scenarioRoot, 'infra/bicep/modules/identity.bicep')),
    false
  );
  assert.doesNotMatch(
    mainBicep,
    /githubRepository|deploymentIdentity|deploymentClientId/
  );
  for (const setup of [bashSetup, powershellSetup]) {
    assert.doesNotMatch(
      setup,
      /variable["',\s]+set["',\s]+AZURE_(?:CLIENT|TENANT|SUBSCRIPTION)_ID/i
    );
    assert.match(setup, /AZURE_RESOURCE_GROUP/);
    assert.match(setup, /AZURE_WEBAPP_NAME/);
  }
});

test('Cloud Agent Handover documents operator-controlled local deployment', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  const readme = readFileSync(resolve(scenarioRoot, 'README.md'), 'utf8');
  const handoverGuide = readFileSync(
    resolve(scenarioRoot, 'docs/90-watch-sre-agent.md'),
    'utf8'
  );
  const operationalGuidance = readFileSync(
    resolve(scenarioRoot, 'knowledge/operational-guidelines.md'),
    'utf8'
  );

  for (const document of [readme, handoverGuide, operationalGuidance]) {
    assert.match(document, /local/i);
    assert.match(document, /deploy\.(?:sh|ps1)/i);
    assert.doesNotMatch(
      document,
      /OIDC-based.*Deploy Cloud Agent Handover/is
    );
  }
  assert.match(handoverGuide, /git pull/i);
});

test('Cloud Agent Handover setup never deletes legacy deployment state automatically', () => {
  const scenarioRoot = resolve(repositoryRoot, 'scenarios/cloud-agent-handover');
  for (const name of ['setup.sh', 'setup.ps1']) {
    const setup = readFileSync(resolve(scenarioRoot, 'scripts', name), 'utf8');
    const executable = setup.replace(/cat <<'EOF'[\s\S]*?\nEOF\n/, '').split('\n').filter(line => !/^\s*(?:#|"|'|LEGACY_GUIDANCE\+=|\$legacyGuidance \+=)/.test(line)).join('\n');
    assert.doesNotMatch(executable, /role["',\s]+assignment["',\s]+delete/i, name);
    assert.doesNotMatch(executable, /identity["',\s]+delete/i, name);
    assert.doesNotMatch(executable, /variable["',\s]+delete/i, name);
    assert.doesNotMatch(executable, /group["',\s]+create/i, name);
    assert.match(setup, /github-deploy/);
  }
});

const fakeTools = {
  az: `#!/usr/bin/env bash
printf 'az %s\\n' "$*" >> "$FAKE_LOG"
case "$1 $2" in
  "account show") if [[ "$*" == *"query id"* ]]; then echo 00000000-0000-0000-0000-000000000001; else echo Workshop; fi ;;
  "account set") ;;
  "provider show") echo Registered ;;
  "identity list") echo "\${FAKE_LEGACY_PRINCIPAL:-}" ;;
esac
exit 0
`,
  gh: `#!/usr/bin/env bash
printf 'gh %s\\n' "$*" >> "$FAKE_LOG"
case "$1 $2" in
  "repo view") echo "\${FAKE_GH_REPO:-attendee/workshop}" ;;
  "api repos/attendee/workshop") echo false ;;
  "api graphql") echo copilot-swe-agent ;;
  "variable list") printf '%s\\n' \${FAKE_VARIABLES:-} ;;
esac
exit 0
`,
  node: `#!/usr/bin/env bash
case "$1" in
  scripts/placement/provision.mjs)
    printf 'node provision %s\\n' "$2" >> "$FAKE_LOG"
    if [ "$2" = check ] && [ -n "\${FAKE_CHECK_FAIL:-}" ]; then echo "Resource group rg-srelabapp contains resources not owned by this scenario." >&2; exit 1; fi
    # Fresh subscription: the strict preflight fails until the providers are
    # registered; the ownership check passes only with deferral requested.
    if [ -n "\${FAKE_PROVIDERS_UNREGISTERED:-}" ] && ! grep -q '^az provider register' "$FAKE_LOG"; then
      if [ "$2" = deploy ] || [[ " $* " != *" --defer-unregistered-providers "* ]]; then
        echo "eastus2: Microsoft.Web is NotRegistered; run: az provider register --namespace Microsoft.Web" >&2; exit 1
      fi
      printf 'node provision check deferred\\n' >> "$FAKE_LOG"
    fi
    if [ "$2" = deploy ]; then
      while [ "$#" -gt 0 ]; do if [ "$1" = --outputs-file ]; then out="$2"; fi; shift; done
      printf '{"webAppName":{"value":"app-x"},"webAppHostName":{"value":"app-x.azurewebsites.net"}}' > "$out"
      mkdir -p .sre-workshop; printf '{"location":"swedencentral"}' > .sre-workshop/cloud-agent-handover-placement.json
    fi
    exit 0 ;;
  scripts/build-artifacts/resolve.mjs)
    printf 'node resolve %s\\n' "$*" >> "$FAKE_LOG"
    if [[ " $* " == *" --repo "* ]]; then echo "setup must let the resolver derive the repository from origin" >&2; exit 1; fi
    if [ -n "\${FAKE_RESOLVE_FAIL:-}" ]; then echo "Artifact resolution failed: no successful build. Run: gh workflow run validate-appservice-app.yml --ref abc" >&2; exit 1; fi
    while [ "$#" -gt 0 ]; do if [ "$1" = --output-dir ]; then dir="$2"; fi; shift; done
    : > "$dir/deployment.zip"
    printf '{"scenario":"cloud-agent-handover","variant":"application","sourceSha":"abc123","deploymentZip":"%s"}\\n' "$dir/deployment.zip"
    exit 0 ;;
  *) exec "$REAL_NODE" "$@" ;;
esac
`,
  git: `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >> "$FAKE_LOG"
if [ "$1 $2 $3" = "remote get-url origin" ]; then echo "\${FAKE_ORIGIN:-https://github.com/attendee/workshop.git}"; exit 0; fi
exit 1
`,
};

function runSetup(t, shell, env = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cloud-setup-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [name, body] of Object.entries(fakeTools)) writeFileSync(join(bin, name), body, { mode: 0o755 });
  const scripts = join(root, 'repo/scenarios/cloud-agent-handover/scripts');
  mkdirSync(scripts, { recursive: true });
  for (const name of ['setup.sh', 'setup.ps1']) {
    writeFileSync(join(scripts, name), readFileSync(resolve(repositoryRoot, 'scenarios/cloud-agent-handover/scripts', name)));
  }
  const log = join(root, 'calls.log');
  writeFileSync(log, '');
  const [command, args] = shell === 'bash'
    ? ['bash', [join(scripts, 'setup.sh'), '--location', 'eastus2']]
    : ['pwsh', ['-NoProfile', '-NonInteractive', '-File', join(scripts, 'setup.ps1'), '-Location', 'eastus2']];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, FAKE_LOG: log, REAL_NODE: process.execPath, AZURE_SUBSCRIPTION_ID: '', ...env },
  });
  return { result, output: `${result.stdout}${result.stderr}`, calls: readFileSync(log, 'utf8').trim().split('\n') };
}

const mutating = /^(?:az (?:provider register|webapp deploy|identity delete|role assignment delete|group (?:create|delete))|gh variable (?:set|delete)|node provision deploy)/;
const shells = [['bash', 'bash'], ['PowerShell', 'pwsh']].filter(([, command]) => !spawnSync(command, ['--version']).error);

for (const [label, shell] of shells) {
  test(`${label} Cloud setup reports legacy state for manual review instead of deleting it`, (t) => {
    const { result, output, calls } = runSetup(t, shell, {
      FAKE_LEGACY_PRINCIPAL: '11111111-2222-3333-4444-555555555555',
      FAKE_VARIABLES: 'AZURE_CLIENT_ID AZURE_TENANT_ID OTHER',
    });
    assert.equal(result.status, 0, output);
    assert.ok(!calls.some(call => /identity delete|role assignment delete|gh variable delete|group create/.test(call)), calls.join('\n'));
    assert.match(output, /Legacy identity srelabapp-github-deploy exists/);
    assert.match(output, /az identity delete --resource-group rg-srelabapp --name srelabapp-github-deploy/);
    assert.match(output, /gh variable delete AZURE_CLIENT_ID --repo attendee\/workshop/);
    assert.doesNotMatch(output, /AZURE_SUBSCRIPTION_ID --repo/);
    const check = calls.indexOf('node provision check');
    const firstMutation = calls.findIndex(call => mutating.test(call));
    assert.ok(check >= 0 && check < firstMutation, calls.join('\n'));
    assert.ok(calls.findIndex(call => call.startsWith('node resolve')) < firstMutation, calls.join('\n'));
    assert.ok(calls.some(call => /^az webapp deploy .*deployment\.zip/.test(call)), calls.join('\n'));
    assert.ok(calls.includes('gh variable set AZURE_LOCATION --repo attendee/workshop --body swedencentral'), calls.join('\n'));
    assert.match(output, /build artifact for commit abc123/);
    assert.ok(calls.includes('gh repo view github.com/attendee/workshop --json nameWithOwner --jq .nameWithOwner'), calls.join('\n'));
  });

  test(`${label} Cloud setup verifies ownership, then registers providers on a fresh subscription`, (t) => {
    const { result, output, calls } = runSetup(t, shell, { FAKE_PROVIDERS_UNREGISTERED: '1' });
    assert.equal(result.status, 0, output);
    const check = calls.indexOf('node provision check');
    const register = calls.findIndex(call => call.startsWith('az provider register'));
    const deploy = calls.indexOf('node provision deploy');
    assert.ok(calls.includes('node provision check deferred'), calls.join('\n'));
    assert.ok(check >= 0 && check < register && register < deploy, calls.join('\n'));
    assert.equal(calls.findIndex(call => mutating.test(call)), register, calls.join('\n'));
    for (const namespace of ['Microsoft.Web', 'Microsoft.Insights', 'Microsoft.OperationalInsights']) {
      assert.ok(calls.some(call => call.startsWith(`az provider register --namespace ${namespace}`)), namespace);
    }
  });

  test(`${label} Cloud setup uses the origin repository, never a different gh default`, (t) => {
    const { result, output, calls } = runSetup(t, shell, { FAKE_GH_REPO: 'upstream/other' });
    assert.notEqual(result.status, 0, output);
    assert.match(output, /refusing to continue with a different repository/);
    assert.ok(!calls.some(call => mutating.test(call) || /node (?:provision|resolve)/.test(call)), calls.join('\n'));
  });

  test(`${label} Cloud setup changes nothing when the ownership check fails`, (t) => {
    const { result, output, calls } = runSetup(t, shell, { FAKE_CHECK_FAIL: '1', FAKE_LEGACY_PRINCIPAL: 'p' });
    assert.notEqual(result.status, 0, output);
    assert.match(output, /stopped before changing anything/);
    assert.ok(!calls.some(call => mutating.test(call) || /identity list|node resolve/.test(call)), calls.join('\n'));
  });

  test(`${label} Cloud setup changes nothing when the build artifact is missing`, (t) => {
    const { result, output, calls } = runSetup(t, shell, { FAKE_RESOLVE_FAIL: '1' });
    assert.notEqual(result.status, 0, output);
    assert.match(output, /gh workflow run validate-appservice-app\.yml --ref abc/);
    assert.match(output, /local-build|LocalBuild/);
    assert.ok(!calls.some(call => mutating.test(call)), calls.join('\n'));
  });
}

test('Shared Cloud Agent Handover guidance uses local deployment', () => {
  const connectorGuide = readFileSync(
    resolve(repositoryRoot, 'docs/connect-github-to-sre-agent.md'),
    'utf8'
  );
  const copilotInstructions = readFileSync(
    resolve(repositoryRoot, '.github/copilot-instructions.md'),
    'utf8'
  );

  for (const document of [connectorGuide, copilotInstructions]) {
    assert.match(document, /deploy\.(?:sh|ps1)/i);
    assert.doesNotMatch(document, /Deploy Cloud Agent Handover Application/);
  }
});
