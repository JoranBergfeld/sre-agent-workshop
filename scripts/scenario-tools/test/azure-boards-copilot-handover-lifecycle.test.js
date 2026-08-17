import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const scenarioRoot = resolve(repositoryRoot, 'scenarios', 'azure-boards-copilot-handover');
const scriptsDirectory = resolve(scenarioRoot, 'scripts');
const mockedLifecyclePath = `${resolve(import.meta.dirname, 'fixtures', 'lifecycle-bin')}:${process.env.PATH}`;
const scratchRoot = resolve(import.meta.dirname, '.tmp-lifecycle-scratch');
mkdirSync(scratchRoot, { recursive: true });
after(() => rmSync(scratchRoot, { recursive: true, force: true }));

function scratchDir() {
  return mkdtempSync(resolve(scratchRoot, 'sre-lifecycle-'));
}

const localHeadSha = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).stdout.trim();

function readScript(name) {
  return readFileSync(resolve(scriptsDirectory, name), 'utf8');
}

function runBash(script, args = [], env = {}) {
  return spawnSync('bash', [resolve(scriptsDirectory, script), ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, PATH: mockedLifecyclePath, ...env },
  });
}

function runPowerShell(script, args = [], env = {}) {
  return spawnSync(
    'pwsh',
    ['-NoProfile', '-File', resolve(scriptsDirectory, script), ...args],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: mockedLifecyclePath, ...env },
    }
  );
}

function bothShells(script, bashArgs, powershellArgs, env = {}) {
  const powershellScript = script.replace(/\.sh$/, '.ps1');
  return [
    ['Bash', runBash(script, bashArgs, env)],
    ['PowerShell', runPowerShell(powershellScript, powershellArgs, env)],
  ];
}

// A status body reporting a fully-recovered incident: deployed SHA matches
// local HEAD, the incident batch is injected, and receipts split 3 v1 / 20 v2.
function healthyStatusBody(overrides = {}) {
  return JSON.stringify({
    incidentBatchId: 'v2-incident-orders',
    incidentBatchInjected: true,
    deployedCommitSha: localHeadSha,
    deployedAtUtc: '2026-08-17T13:52:55Z',
    normalizedReceiptCount: 23,
    v1ReceiptCount: 3,
    v2ReceiptCount: 20,
    ...overrides,
  });
}

test('All new lifecycle scripts exist, are paired, and Bash scripts are executable', () => {
  for (const base of ['setup', 'deploy', 'inject', 'validate', 'cleanup']) {
    const bashPath = resolve(scriptsDirectory, `${base}.sh`);
    const powershellPath = resolve(scriptsDirectory, `${base}.ps1`);

    assert.ok(existsSync(bashPath), `missing ${base}.sh`);
    assert.ok(existsSync(powershellPath), `missing ${base}.ps1`);
    assert.notEqual(
      statSync(bashPath).mode & 0o111,
      0,
      `${base}.sh must be executable`
    );
  }
});

test('Lifecycle scripts no longer describe themselves as no-op placeholders', () => {
  for (const base of ['setup', 'deploy', 'inject', 'validate', 'cleanup']) {
    assert.doesNotMatch(readScript(`${base}.sh`), /no-op in the template/);
    assert.doesNotMatch(readScript(`${base}.ps1`), /no-op in the template/);
  }
});

test('setup/deploy/inject/validate/cleanup default to the approved workload, resource group, and location', () => {
  for (const base of ['setup', 'deploy', 'inject', 'validate', 'cleanup']) {
    const bash = readScript(`${base}.sh`);
    const powershell = readScript(`${base}.ps1`);

    assert.match(bash, /srelabboardshandover/);
    assert.match(powershell, /srelabboardshandover/);
  }

  const setupBash = readScript('setup.sh');
  assert.match(setupBash, /-rg/);
  assert.match(setupBash, /eastus2/);
});

test('setup and cleanup help documents workload, resource group, subscription, and location parity', () => {
  for (const [shell, result] of bothShells('setup.sh', ['--help'], ['-Help'])) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /workload/i, shell);
    assert.match(result.stdout, /location/i, shell);
    assert.match(result.stdout, /subscription-id/i, shell);
  }

  for (const [shell, result] of bothShells('cleanup.sh', ['--help'], ['-Help'])) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /workload/i, shell);
    assert.match(result.stdout, /resource-group/i, shell);
    assert.match(result.stdout, /--yes/i, shell);
    assert.match(result.stdout, /--dry-run/i, shell);
  }
});

test('deploy, inject, and validate help document app-name overrides', () => {
  for (const base of ['deploy', 'inject', 'validate']) {
    for (const [shell, result] of bothShells(`${base}.sh`, ['--help'], ['-Help'])) {
      assert.equal(result.status, 0, `${shell} ${base}: ${result.stderr}`);
      assert.match(result.stdout, /app-name/i, `${shell} ${base}`);
      assert.match(result.stdout, /resource-group/i, `${shell} ${base}`);
    }
  }
});

test('Every new lifecycle script rejects unknown options instead of silently continuing', () => {
  for (const base of ['setup', 'deploy', 'inject', 'validate', 'cleanup']) {
    for (const [shell, result] of bothShells(
      `${base}.sh`,
      ['--not-a-real-option'],
      ['--not-a-real-option']
    )) {
      assert.notEqual(result.status, 0, `${shell} ${base} accepted an unknown option`);
    }
  }
});

test('Cleanup only ever deletes the derived scenario resource group and never touches GitHub or Azure Boards', () => {
  for (const base of ['cleanup.sh', 'cleanup.ps1']) {
    const source = readScript(base);
    assert.doesNotMatch(source, /\bgh\s+/);
    assert.doesNotMatch(source, /\baz\s+boards\b/i);
  }
});

test('Cleanup dry-run reports the derived resource group without deleting it', () => {
  for (const [shell, result] of bothShells(
    'cleanup.sh',
    ['--dry-run'],
    ['--dry-run']
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /srelabboardshandover-rg/, shell);
    assert.match(result.stdout, /Dry run/i, shell);
  }
});

test('Cleanup derives rg-<workload>-rg style resource group from a custom workload', () => {
  for (const [shell, result] of bothShells(
    'cleanup.sh',
    ['--workload', 'custom-workload', '--dry-run'],
    ['-Workload', 'custom-workload', '--dry-run']
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /custom-workload-rg/, shell);
  }
});

test('Cleanup honors an explicit --resource-group override', () => {
  for (const [shell, result] of bothShells(
    'cleanup.sh',
    ['--resource-group', 'rg-custom', '--dry-run'],
    ['-ResourceGroup', 'rg-custom', '--dry-run']
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /rg-custom/, shell);
    assert.doesNotMatch(result.stdout, /srelabboardshandover-rg/, shell);
  }
});

test('Cleanup skips the confirmation prompt with --yes and deletes only the scenario resource group', () => {
  for (const [shell, result] of bothShells(
    'cleanup.sh',
    ['--workload', 'custom-workload', '--yes'],
    ['-Workload', 'custom-workload', '--yes']
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /\[y\/N\]/, shell);
  }
});

test('Cleanup verifies the requested Azure subscription before deleting', () => {
  const bash = readScript('cleanup.sh');
  const powershell = readScript('cleanup.ps1');

  assert.match(bash, /az account set --subscription/);
  assert.match(bash, /az account show/);
  assert.match(bash, /Azure subscription mismatch/);
  assert.match(powershell, /az account set --subscription/);
  assert.match(powershell, /az account show/);
  assert.match(powershell, /Azure subscription mismatch/);
});

test('Deploy stamps the current git HEAD SHA and a UTC timestamp as Function app settings', () => {
  for (const shell of ['Bash', 'PowerShell']) {
    const logPath = resolve(scratchDir(), 'az.log');
    const result =
      shell === 'Bash'
        ? runBash(
            'deploy.sh',
            ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
            { LIFECYCLE_AZ_LOG_PATH: logPath, LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody() }
          )
        : runPowerShell(
            'deploy.ps1',
            ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
            { LIFECYCLE_AZ_LOG_PATH: logPath, LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody() }
          );
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\n${result.stdout}`);
    const azLog = readFileSync(logPath, 'utf8');
    assert.match(
      azLog,
      new RegExp(`functionapp config appsettings set.*DEPLOYED_COMMIT_SHA=${localHeadSha}`),
      shell
    );
    assert.match(
      azLog,
      /DEPLOYED_AT_UTC=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/,
      shell
    );
  }
});

test('Deploy sets remote build only when it is not already enabled', () => {
  const alreadyEnabledLog = resolve(scratchDir(), 'az.log');
  const notEnabledLog = resolve(scratchDir(), 'az.log');

  const alreadyEnabled = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_AZ_LOG_PATH: alreadyEnabledLog,
      LIFECYCLE_AZ_SCM_BUILD_SETTING: 'true',
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
    }
  );
  assert.equal(alreadyEnabled.status, 0, alreadyEnabled.stderr);
  assert.doesNotMatch(
    readFileSync(alreadyEnabledLog, 'utf8'),
    /appsettings set[^\n]*SCM_DO_BUILD_DURING_DEPLOYMENT/
  );

  const notEnabled = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_AZ_LOG_PATH: notEnabledLog,
      LIFECYCLE_AZ_SCM_BUILD_SETTING: '',
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
    }
  );
  assert.equal(notEnabled.status, 0, notEnabled.stderr);
  assert.match(
    readFileSync(notEnabledLog, 'utf8'),
    /functionapp config appsettings set.*SCM_DO_BUILD_DURING_DEPLOYMENT=true/
  );
});

test('Deploy runs the app baseline quality gates from the current checkout', () => {
  const bash = readScript('deploy.sh');
  const powershell = readScript('deploy.ps1');

  for (const source of [bash, powershell]) {
    assert.match(source, /ruff["'\s]+format["'\s]+--check/);
    assert.match(source, /ruff["'\s]+check/);
    assert.match(source, /mypy/);
    assert.match(source, /pytest/);
  }
});

test('Deploy zips only runtime files (excludes venv and tests) and cleans temp files', () => {
  const keepTempDirectoryLog = resolve(
    scratchDir(),
    'keep-temp-dir.txt'
  );

  const result = runBash(
    'deploy.sh',
    [
      '--resource-group',
      'srelabboardshandover-rg',
      '--app-name',
      'test-func',
      '--keep-temp',
    ],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      DEPLOY_KEEP_TEMP_DIR_LOG: keepTempDirectoryLog,
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const keptDirectory = readFileSync(keepTempDirectoryLog, 'utf8').trim();
  assert.ok(existsSync(keptDirectory), 'kept temp directory should still exist');

  const zipList = spawnSync('unzip', ['-l', resolve(keptDirectory, 'app.zip')], {
    encoding: 'utf8',
  });
  assert.equal(zipList.status, 0, zipList.stderr);
  assert.match(zipList.stdout, /function_app\.py/);
  assert.match(zipList.stdout, /host\.json/);
  assert.match(zipList.stdout, /order_events\/workshop\.py/);
  assert.doesNotMatch(zipList.stdout, /tests\//);
  assert.doesNotMatch(zipList.stdout, /\.venv\//);
  assert.doesNotMatch(zipList.stdout, /__pycache__/);

  rmSync(keptDirectory, { recursive: true, force: true });

  const cleanupResult = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    { LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody() }
  );
  assert.equal(cleanupResult.status, 0, cleanupResult.stderr);
  assert.doesNotMatch(cleanupResult.stdout, /app\.zip/);
});

test('Deploy waits (bounded) for the keyed status endpoint to report the deployed SHA', () => {
  const counterFile = resolve(scratchDir(), 'counter');

  const eventuallySucceeds = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_COUNTER_FILE: counterFile,
      LIFECYCLE_CURL_STATUS_PENDING_ATTEMPTS: '2',
      LIFECYCLE_CURL_STATUS_PENDING_BODY: healthyStatusBody({ deployedCommitSha: 'stale-sha' }),
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      STATUS_POLL_ATTEMPTS: '5',
      STATUS_POLL_DELAY_SECONDS: '0',
    }
  );

  assert.equal(eventuallySucceeds.status, 0, eventuallySucceeds.stderr);
  rmSync(counterFile, { force: true });

  const neverSucceeds = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_COUNTER_FILE: counterFile,
      LIFECYCLE_CURL_STATUS_PENDING_ATTEMPTS: '999',
      LIFECYCLE_CURL_STATUS_PENDING_BODY: healthyStatusBody({ deployedCommitSha: 'stale-sha' }),
      STATUS_POLL_ATTEMPTS: '2',
      STATUS_POLL_DELAY_SECONDS: '0',
    }
  );

  assert.notEqual(neverSucceeds.status, 0);
  assert.match(neverSucceeds.stderr, /timed out|did not report/i);
});

test('Deploy stamps DEPLOYED_COMMIT_SHA and deploys before proving go-live, and only stamps DEPLOYED_AT_UTC after the new SHA is confirmed live (cutover ordering, Bash/PowerShell parity)', () => {
  const cases = [
    ['Bash', 'deploy.sh', ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'], runBash],
    ['PowerShell', 'deploy.ps1', ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'], runPowerShell],
  ];

  for (const [shell, script, args, run] of cases) {
    const logPath = resolve(scratchDir(), 'az.log');
    const result = run(script, args, {
      LIFECYCLE_AZ_LOG_PATH: logPath,
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
    });
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\n${result.stdout}`);

    const lines = readFileSync(logPath, 'utf8').split('\n');
    const shaSettingLineIndex = lines.findIndex((line) =>
      line.includes(`DEPLOYED_COMMIT_SHA=${localHeadSha}`)
    );
    const deployLineIndex = lines.findIndex((line) => line.includes('functionapp deploy'));
    const atUtcSettingLineIndex = lines.findIndex((line) => line.includes('DEPLOYED_AT_UTC='));

    assert.ok(shaSettingLineIndex >= 0, `${shell}: DEPLOYED_COMMIT_SHA setting missing from az log`);
    assert.ok(deployLineIndex >= 0, `${shell}: functionapp deploy missing from az log`);
    assert.ok(atUtcSettingLineIndex >= 0, `${shell}: DEPLOYED_AT_UTC setting missing from az log`);

    assert.ok(
      shaSettingLineIndex < deployLineIndex,
      `${shell}: DEPLOYED_COMMIT_SHA must be stamped before the zip is deployed (needed for the go-live poll)`
    );
    assert.ok(
      deployLineIndex < atUtcSettingLineIndex,
      `${shell}: DEPLOYED_AT_UTC must be stamped only after deploy + the go-live poll confirm the new SHA`
    );
    assert.doesNotMatch(
      lines[shaSettingLineIndex],
      /DEPLOYED_AT_UTC=/,
      `${shell}: DEPLOYED_COMMIT_SHA must be stamped on its own settings call, separate from DEPLOYED_AT_UTC`
    );
  }
});

test('Deploy re-confirms (bounded) that the app is coherent after stamping DEPLOYED_AT_UTC, without an unbounded or circular poll', () => {
  const markerFile = resolve(scratchDir(), 'atutc-marker');
  const cutoverCounterFile = resolve(scratchDir(), 'cutover-counter');

  const eventuallyCoherent = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_AZ_ATUTC_MARKER_FILE: markerFile,
      LIFECYCLE_CURL_STATUS_CUTOVER_COUNTER_FILE: cutoverCounterFile,
      LIFECYCLE_CURL_STATUS_CUTOVER_PENDING_ATTEMPTS: '2',
      LIFECYCLE_CURL_STATUS_CUTOVER_PENDING_BODY: healthyStatusBody({
        deployedCommitSha: 'stale-after-cutover-restart',
      }),
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      STATUS_POLL_ATTEMPTS: '5',
      STATUS_POLL_DELAY_SECONDS: '0',
    }
  );
  assert.equal(eventuallyCoherent.status, 0, eventuallyCoherent.stderr);

  rmSync(markerFile, { force: true });
  rmSync(cutoverCounterFile, { force: true });

  const neverCoherent = runBash(
    'deploy.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_AZ_ATUTC_MARKER_FILE: markerFile,
      LIFECYCLE_CURL_STATUS_CUTOVER_COUNTER_FILE: cutoverCounterFile,
      LIFECYCLE_CURL_STATUS_CUTOVER_PENDING_ATTEMPTS: '999',
      LIFECYCLE_CURL_STATUS_CUTOVER_PENDING_BODY: healthyStatusBody({
        deployedCommitSha: 'stale-after-cutover-restart',
      }),
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      STATUS_POLL_ATTEMPTS: '2',
      STATUS_POLL_DELAY_SECONDS: '0',
    }
  );
  assert.notEqual(neverCoherent.status, 0);
  assert.match(neverCoherent.stderr, /timed out|did not/i);
  // Exactly STATUS_POLL_ATTEMPTS cutover-phase status calls were made,
  // proving the re-poll is bounded rather than unbounded or circular.
  assert.equal(readFileSync(cutoverCounterFile, 'utf8').trim(), '2');
});

test('Setup provisions the subscription-scope Bicep template and captures its outputs', () => {
  const bash = readScript('setup.sh');
  const powershell = readScript('setup.ps1');

  assert.match(bash, /az deployment sub create/);
  assert.match(bash, /infra\/bicep\/main\.bicep/);
  assert.match(bash, /properties\.outputs/);
  assert.match(powershell, /az deployment sub create/);
  assert.match(powershell, /infra\/bicep\/main\.bicep/);
});

test('Setup deploys the current checkout, seeds v1 controls exactly once, and prints keyed URLs without the seed URL', () => {
  for (const [shell, result] of bothShells(
    'setup.sh',
    ['--workload', 'srelabboardshandover'],
    ['-Workload', 'srelabboardshandover'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      RETRY_DELAY_SECONDS: '0',
    }
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /status\?code=/, shell);
    assert.match(result.stdout, /submit-v2-orders\?code=/, shell);
    assert.doesNotMatch(result.stdout, /seed-v1-controls\?code=/, shell);
    assert.doesNotMatch(result.stdout, /test-function-key/, `${shell} must never print the raw key value`);
  }
});

test('Setup retries seeding v1 controls with bounded attempts for Function startup/RBAC propagation', () => {
  const succeeds = runBash(
    'setup.sh',
    ['--workload', 'srelabboardshandover'],
    {
      LIFECYCLE_AZ_KEYS_FAIL_ATTEMPTS: '2',
      LIFECYCLE_AZ_KEYS_COUNTER_FILE: resolve(
        scratchDir(),
        'keys-counter'
      ),
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      RETRY_ATTEMPTS: '5',
      RETRY_DELAY_SECONDS: '0',
    }
  );
  assert.equal(succeeds.status, 0, succeeds.stderr);

  const timesOut = runBash(
    'setup.sh',
    ['--workload', 'srelabboardshandover'],
    {
      LIFECYCLE_AZ_KEYS_FAIL_ATTEMPTS: '999',
      LIFECYCLE_AZ_KEYS_COUNTER_FILE: resolve(
        scratchDir(),
        'keys-counter'
      ),
      RETRY_ATTEMPTS: '2',
      RETRY_DELAY_SECONDS: '0',
    }
  );
  assert.notEqual(timesOut.status, 0);
  assert.match(timesOut.stderr, /timed out|failed after/i);
});

test('PowerShell setup retries a transient deploy.ps1 throw instead of aborting on the first failure', () => {
  const azLogPath = resolve(scratchDir(), 'az.log');
  const statusCounterFile = resolve(scratchDir(), 'status-counter');
  const result = runPowerShell(
    'setup.ps1',
    ['-Workload', 'srelabboardshandover'],
    {
      LIFECYCLE_AZ_LOG_PATH: azLogPath,
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_CURL_STATUS_COUNTER_FILE: statusCounterFile,
      LIFECYCLE_CURL_STATUS_PENDING_ATTEMPTS: '2',
      RETRY_ATTEMPTS: '2',
      RETRY_DELAY_SECONDS: '0',
      STATUS_POLL_ATTEMPTS: '2',
      STATUS_POLL_DELAY_SECONDS: '0',
    }
  );

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Deploy attempt 1 failed; retrying in 0s\./);
  assert.match(result.stdout, /Timed out after 2 attempts: status endpoint did not report DEPLOYED_COMMIT_SHA=/);
  assert.equal(
    readFileSync(azLogPath, 'utf8').match(/functionapp deploy /g)?.length,
    2,
    'setup.ps1 should invoke deploy.ps1 twice when the first attempt throws transiently'
  );
});

test('Setup seeding v1 controls is idempotent: a repeat call reports already-injected without duplicating', () => {
  const logPath = resolve(scratchDir(), 'curl.log');
  const result = runBash(
    'setup.sh',
    ['--workload', 'srelabboardshandover'],
    {
      LIFECYCLE_CURL_SEED_CODE: '200',
      LIFECYCLE_CURL_SEED_BODY: '{"controlBatchAlreadyInjected":true,"eventsEnqueued":0}',
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_CURL_LOG_PATH: logPath,
      RETRY_DELAY_SECONDS: '0',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(logPath, 'utf8'), /seed-v1-controls\?code=/);
});

test('Inject submits the keyed v2 incident batch, treats a fresh 202 as success, and shows status', () => {
  for (const [shell, result] of bothShells(
    'inject.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_SUBMIT_CODE: '202',
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({ incidentBatchInjected: true }),
    }
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /incidentBatchInjected/, shell);
  }
});

test('Inject treats a completed-repeat 200 as success (idempotent, recoverable)', () => {
  for (const [shell, result] of bothShells(
    'inject.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_SUBMIT_CODE: '200',
      LIFECYCLE_CURL_SUBMIT_BODY:
        '{"incidentBatchAlreadyInjected":true,"eventsEnqueued":0}',
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({ incidentBatchInjected: true }),
    }
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}`);
    assert.match(result.stdout, /incidentBatchInjected/, shell);
  }
});

test('Inject fails loudly on an unexpected submit-v2-orders response', () => {
  for (const [shell, result] of bothShells(
    'inject.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    { LIFECYCLE_CURL_SUBMIT_CODE: '500', LIFECYCLE_CURL_SUBMIT_BODY: '{"error":"boom"}' }
  )) {
    assert.notEqual(result.status, 0, shell);
  }
});

test('Validate proves the deployed SHA matches local HEAD, the incident is completed, and receipts split 3 v1 / 20 v2', () => {
  for (const [shell, result] of bothShells(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  )) {
    assert.equal(result.status, 0, `${shell}: ${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /23/, shell);
  }
});

test('Validate fails when the deployed SHA does not match local HEAD', () => {
  const result = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({ deployedCommitSha: 'not-the-local-head' }),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sha/i);
});

test('Validate fails when the receipt split is not exactly 3 v1 and 20 v2', () => {
  const result = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({ v2ReceiptCount: 19, normalizedReceiptCount: 22 }),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /receipt/i);
});

test('Validate fails when the incident batch is not yet completed, parsing the legitimate JSON false without aborting silently', () => {
  // `incidentBatchInjected: false` is a legitimate JSON boolean, not a parse
  // error. `jq -e` treats `false`/`null` output as a jq-level failure, so a
  // naive `jq -er` under `set -e` (Bash) would abort before ever printing the
  // SHA comparison lines or emitting the intended diagnostic. Both shells
  // must parse it, print the diagnostic, and keep going (Bash keeps
  // aggregating; PowerShell must not terminate on the first Write-Error).
  for (const [shell, result] of bothShells(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({ incidentBatchInjected: false }),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  )) {
    assert.notEqual(result.status, 0, shell);
    assert.match(
      result.stderr,
      /FAIL: the incident batch has not completed \(incidentBatchInjected=false\)/,
      `${shell}: expected the specific incident-not-completed diagnostic, not just a nonzero exit`
    );
    assert.match(
      result.stdout,
      /Deployed commit SHA/,
      `${shell}: script must reach and print the SHA comparison before failing on the incident check`
    );
  }
});

test('Validate aggregates all pre-telemetry failures instead of stopping at the first one (PowerShell parity)', () => {
  // Bash already aggregates via `failures=$((failures + 1))`. PowerShell's
  // `Write-Error` under `$ErrorActionPreference = 'Stop'` is a terminating
  // error, so it must never be used mid-aggregation: it would report only
  // the first failure and silently drop the rest.
  for (const [shell, result] of bothShells(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody({
        deployedCommitSha: 'not-the-local-head',
        incidentBatchInjected: false,
        v2ReceiptCount: 19,
        normalizedReceiptCount: 22,
      }),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  )) {
    assert.notEqual(result.status, 0, shell);
    assert.match(result.stderr, /FAIL: deployed sha/i, `${shell}: missing sha diagnostic`);
    assert.match(
      result.stderr,
      /FAIL: the incident batch has not completed/i,
      `${shell}: missing incident diagnostic`
    );
    assert.match(result.stderr, /FAIL: receipt split/i, `${shell}: missing receipt diagnostic`);
    assert.match(result.stderr, /\(3 issue\(s\)\)/, `${shell}: missing aggregated failure count`);
  }
});

test('Validate aggregates telemetry failures (Service Bus and Application Insights) instead of stopping at the first one (PowerShell parity)', () => {
  for (const [shell, result] of bothShells(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    ['-ResourceGroup', 'srelabboardshandover-rg', '-AppName', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '4',
      LIFECYCLE_AZ_QUEUE_DLQ: '2',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '3',
    }
  )) {
    assert.notEqual(result.status, 0, shell);
    assert.match(result.stderr, /active/i, `${shell}: missing active-message diagnostic`);
    assert.match(result.stderr, /dead-letter|dlq/i, `${shell}: missing dead-letter diagnostic`);
    assert.match(
      result.stderr,
      /UnsupportedReceiptSchemaError|exception/i,
      `${shell}: missing exception diagnostic`
    );
    assert.match(result.stderr, /\(3 issue\(s\)\)/, `${shell}: missing aggregated failure count`);
  }
});

test('Validate fails on non-zero Service Bus active or dead-letter counts', () => {
  const activeBacklog = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '4',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  );
  assert.notEqual(activeBacklog.status, 0);
  assert.match(activeBacklog.stderr, /active/i);

  const deadLettered = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '2',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  );
  assert.notEqual(deadLettered.status, 0);
  assert.match(deadLettered.stderr, /dead-letter|dlq/i);
});

test('Validate fails when UnsupportedReceiptSchemaError exceptions occurred after DEPLOYED_AT_UTC', () => {
  const result = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '3',
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UnsupportedReceiptSchemaError|exception/i);
});

test('Validate matches UnsupportedReceiptSchemaError exceptions robustly for module-qualified type names (KQL endswith)', () => {
  for (const script of ['validate.sh', 'validate.ps1']) {
    assert.match(
      readScript(script),
      /type\s+endswith\s+["']UnsupportedReceiptSchemaError["']/,
      `${script} should match the exception type with endswith so module-qualified names (e.g. Contoso.Boards.UnsupportedReceiptSchemaError) still count`
    );
  }

  const logPath = resolve(scratchDir(), 'az.log');
  const result = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_AZ_LOG_PATH: logPath,
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_EXCEPTION_COUNT: '0',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(logPath, 'utf8'),
    /type endswith 'UnsupportedReceiptSchemaError'/,
    'the generated analytics query passed to az monitor app-insights query should use endswith'
  );
});

test('Validate queries the Service Bus queue and Application Insights explicitly, and fails loudly when either query fails', () => {
  const bash = readScript('validate.sh');
  assert.match(bash, /az servicebus queue show/);
  assert.match(bash, /az monitor app-insights query/);

  const queueQueryFails = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_FAIL_QUEUE_SHOW: '1',
    }
  );
  assert.notEqual(queueQueryFails.status, 0);
  assert.match(queueQueryFails.stderr, /simulated Service Bus queue query failure/);

  const appInsightsQueryFails = runBash(
    'validate.sh',
    ['--resource-group', 'srelabboardshandover-rg', '--app-name', 'test-func'],
    {
      LIFECYCLE_CURL_STATUS_BODY: healthyStatusBody(),
      LIFECYCLE_AZ_QUEUE_ACTIVE: '0',
      LIFECYCLE_AZ_QUEUE_DLQ: '0',
      LIFECYCLE_AZ_FAIL_APP_INSIGHTS_QUERY: '1',
    }
  );
  assert.notEqual(appInsightsQueryFails.status, 0);
  assert.match(appInsightsQueryFails.stderr, /simulated Application Insights query failure/);
});

test('setup, deploy, inject, validate, and cleanup never persist the Function host key to disk', () => {
  for (const base of ['setup.sh', 'setup.ps1', 'deploy.sh', 'deploy.ps1', 'inject.sh', 'inject.ps1', 'validate.sh', 'validate.ps1']) {
    const source = readScript(base);
    assert.doesNotMatch(
      source,
      />\s*"?\$?\(?(?:HOST_)?KEY\)?"?\s*$/m,
      `${base} must never redirect the function key to a file`
    );
    assert.doesNotMatch(source, /Set-Content.*[Kk]ey/);
    assert.doesNotMatch(source, /Out-File.*[Kk]ey/);
  }
});
