import { spawnSync } from 'node:child_process';
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const capsuleRoot = resolve(import.meta.dirname, '..');

function capsulePath(...segments) {
  return resolve(capsuleRoot, ...segments);
}

function run(command, arguments_, { env = {}, input } = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: capsuleRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input,
  });

  assert.ifError(result.error);
  return result;
}

test('PowerShell validation fails when the Azure inventory query fails', () => {
  const fixtureDirectory = capsulePath('tests/fixtures');
  const result = run(
    'pwsh',
    ['-NoProfile', '-File', capsulePath('scripts/validate.ps1')],
    { env: { PATH: `${fixtureDirectory}:${process.env.PATH}` } },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /az vm list failed/);
});

function createTemporaryAuditDirectory(t) {
  const temporaryRoot = mkdtempSync(capsulePath('tests', 'audit-'));
  const outputDirectory = capsulePath('output');
  const originalOutputDirectory = resolve(temporaryRoot, 'original-output');
  const redirectedOutputDirectory = resolve(temporaryRoot, 'redirected-output');
  const requestedOutputDirectory = resolve(temporaryRoot, 'requested-output');
  const originalAuditPath = resolve(outputDirectory, 'actions-audit.log');
  const originalAudit = existsSync(originalAuditPath)
    ? readFileSync(originalAuditPath, 'utf8')
    : undefined;

  mkdirSync(redirectedOutputDirectory);
  mkdirSync(requestedOutputDirectory);
  renameSync(outputDirectory, originalOutputDirectory);
  symlinkSync(redirectedOutputDirectory, outputDirectory, 'dir');

  t.after(() => {
    unlinkSync(outputDirectory);
    renameSync(originalOutputDirectory, outputDirectory);
    const restoredAuditPath = resolve(outputDirectory, 'actions-audit.log');
    if (originalAudit === undefined) {
      assert.equal(existsSync(restoredAuditPath), false);
    } else {
      assert.equal(readFileSync(restoredAuditPath, 'utf8'), originalAudit);
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  return requestedOutputDirectory;
}

function replaceScriptForTest(t, scriptPath, replacement) {
  const original = readFileSync(scriptPath, 'utf8');
  const mode = statSync(scriptPath).mode;
  writeFileSync(scriptPath, replacement);
  chmodSync(scriptPath, mode);
  t.after(() => {
    writeFileSync(scriptPath, original);
    chmodSync(scriptPath, mode);
  });
}

function collectScripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    return entry.isDirectory()
      ? collectScripts(entryPath)
      : entry.name.endsWith('.sh') || entry.name.endsWith('.ps1')
        ? [entryPath]
        : [];
  });
}

test('capsule manifest and assets use only local lifecycle and tool paths', () => {
  const requiredFiles = [
    'scenario.yaml',
    'README.md',
    'docs/00-prerequisites.md',
    'docs/01-deploy-infrastructure.md',
    'docs/02-configure-incident-response.md',
    'docs/90-watch-sre-agent.md',
    'docs/99-cleanup.md',
    'infra/bicep/main.bicep',
    'infra/bicep/main.bicepparam',
    'infra/bicep/modules/identity.bicep',
    'infra/bicep/modules/monitoring.bicep',
    'infra/bicep/modules/network.bicep',
    'infra/bicep/modules/vm.bicep',
    'infra/bicep/service-health-alert.bicep',
    'investigation/query.kql',
    'knowledge/operational-guidelines.md',
    'output/.gitkeep',
    'scripts/setup.sh',
    'scripts/setup.ps1',
    'scripts/inject.sh',
    'scripts/inject.ps1',
    'scripts/validate.sh',
    'scripts/validate.ps1',
    'scripts/cleanup.sh',
    'scripts/cleanup.ps1',
    'scripts/access/start-http-tunnel.sh',
    'scripts/access/start-http-tunnel.ps1',
    'scripts/access/start-rdp-tunnel.sh',
    'scripts/access/start-rdp-tunnel.ps1',
    'scripts/remediation/migrate-vm-size.sh',
    'scripts/remediation/migrate-vm-size.ps1',
    'scripts/tools/invoke-approved-remediation.sh',
    'scripts/tools/Invoke-ApprovedRemediation.ps1',
    'scripts/tools/invoke-vm-investigation.sh',
    'scripts/tools/Invoke-VmInvestigation.ps1',
    'scripts/tools/invoke-vm-run-command.sh',
    'scripts/tools/Invoke-VmRunCommand.ps1',
  ];

  for (const file of requiredFiles) {
    assert.ok(existsSync(capsulePath(file)), `missing capsule asset: ${file}`);
  }

  const manifest = readFileSync(capsulePath('scenario.yaml'), 'utf8');
  assert.match(manifest, /platform: Azure Virtual Machines/);
  assert.match(manifest, /incidentType: Platform lifecycle advisory/);
  assert.match(manifest, /costProfile: high/);
  assert.match(manifest, /guide: README\.md/);
  assert.match(manifest, /bash: scripts\/remediation\/migrate-vm-size\.sh/);
  assert.match(manifest, /powershell: scripts\/remediation\/migrate-vm-size\.ps1/);
  assert.doesNotMatch(manifest, /^\s*signal:/m);

  for (const script of collectScripts(capsulePath('scripts'))) {
    assert.doesNotMatch(
      readFileSync(script, 'utf8'),
      /workshops[\\/]vm/,
      `${script} must not reach into the legacy VM workshop`,
    );
  }
});

test('operational guidance makes the approval gate the normal remediation path', () => {
  const guidanceFiles = [
    'README.md',
    'docs/90-watch-sre-agent.md',
    'knowledge/operational-guidelines.md',
    'scripts/tools/invoke-vm-investigation.sh',
    'scripts/tools/Invoke-VmInvestigation.ps1',
  ];

  for (const file of guidanceFiles) {
    const content = readFileSync(capsulePath(file), 'utf8');
    assert.match(content, /approval[- ]gate|approval-gated/i, `${file} must require the approval gate`);
    assert.doesNotMatch(content, /@copilot/i, `${file} must not prescribe a Copilot handoff`);
  }
});

test('Bicep assigns least-privilege roles to the configured SRE Agent principal', () => {
  const main = readFileSync(capsulePath('infra/bicep/main.bicep'), 'utf8');
  const parameters = readFileSync(capsulePath('infra/bicep/main.bicepparam'), 'utf8');
  const identity = readFileSync(capsulePath('infra/bicep/modules/identity.bicep'), 'utf8');
  const bashSetup = readFileSync(capsulePath('scripts/setup.sh'), 'utf8');
  const powerShellSetup = readFileSync(capsulePath('scripts/setup.ps1'), 'utf8');
  const deploymentGuide = readFileSync(capsulePath('docs/01-deploy-infrastructure.md'), 'utf8');
  const onboardingGuide = readFileSync(capsulePath('docs/02-configure-incident-response.md'), 'utf8');

  assert.match(main, /param sreAgentPrincipalId string = ''/);
  assert.match(main, /sreAgentPrincipalId: sreAgentPrincipalId/);
  assert.match(parameters, /param sreAgentPrincipalId = ''/);
  assert.match(identity, /param sreAgentPrincipalId string/);
  assert.match(identity, /principalId: sreAgentPrincipalId/);
  assert.doesNotMatch(identity, /resource operationsIdentity/);
  assert.match(bashSetup, /--sre-agent-principal-id/);
  assert.match(powerShellSetup, /SreAgentPrincipalId/);
  assert.match(deploymentGuide, /sreAgentPrincipalId/);
  assert.match(onboardingGuide, /Reader.*Monitoring Reader/s);
});

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/cleanup.sh'),
      '--yes',
      '--dry-run',
      '--resource-group',
      'rg-custom',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/cleanup.ps1'),
      '--yes',
      '--dry-run',
      '-ResourceGroup',
      'rg-custom',
    ],
  ],
]) {
  test(`${label} cleanup treats --yes as a boolean flag`, () => {
    const result = run(command, arguments_);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resource group: rg-custom/);
    assert.match(result.stdout, /Dry run: would delete resource group 'rg-custom'\./);
  });
}

test('Bash approval gate writes a terminal failure audit when remediation exits without progress', (t) => {
  const outputDirectory = createTemporaryAuditDirectory(t);
  const remediationPath = capsulePath('scripts/remediation/migrate-vm-size.sh');
  replaceScriptForTest(t, remediationPath, '#!/usr/bin/env bash\nexit 70\n');

  const result = run(
    'bash',
    [
      capsulePath('scripts/tools/invoke-approved-remediation.sh'),
      '--action',
      'migrate-vm-size',
      '--change-ticket',
      'CHG-70707',
    ],
    {
      env: { SRE_OUTPUT_DIR: outputDirectory },
      input: 'APPROVE\n',
    },
  );

  assert.equal(result.status, 70, result.stderr);
  const auditEntries = readFileSync(resolve(outputDirectory, 'actions-audit.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(auditEntries.map((entry) => entry.status), ['approved', 'started', 'failed']);
  assert.equal(auditEntries[2].exitCode, 70);
  assert.equal(auditEntries[2].completedVms, 0);
});

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/tools/invoke-approved-remediation.sh'),
      '--action',
      'migrate-vm-size',
      '--change-ticket',
      'CHG-12345',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
      '-Action',
      'migrate-vm-size',
      '-ChangeTicket',
      'CHG-12345',
    ],
  ],
]) {
  test(`${label} approval gate denies a non-APPROVE response without auditing`, (t) => {
    const outputDirectory = createTemporaryAuditDirectory(t);
    const result = run(command, arguments_, {
      env: { SRE_OUTPUT_DIR: outputDirectory },
      input: 'DENY\n',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit approval was not granted/);
    assert.equal(existsSync(resolve(outputDirectory, 'actions-audit.log')), false);
  });
}

test('approval gates migrate with mocked Azure CLI and write only temporary audits', (t) => {
  const outputDirectory = createTemporaryAuditDirectory(t);
  const fixtureDirectory = capsulePath('tests/fixtures/az-success');
  const tracePath = resolve(outputDirectory, 'az-success.log');
  const commands = [
    [
      'bash',
      [
        capsulePath('scripts/tools/invoke-approved-remediation.sh'),
        '--action',
        'migrate-vm-size',
        '--change-ticket',
        'CHG-12345',
      ],
    ],
    [
      'pwsh',
      [
        '-NoProfile',
        '-File',
        capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
        '-Action',
        'migrate-vm-size',
        '-ChangeTicket',
        'INC-67890',
      ],
    ],
  ];

  for (const [command, arguments_] of commands) {
    const result = run(command, arguments_, {
      env: {
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        SRE_OUTPUT_DIR: outputDirectory,
        AZ_SUCCESS_TRACE: tracePath,
      },
      input: 'APPROVE\n',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Migration complete\. Resized 2 VM\(s\)/);
    assert.match(result.stdout, /Approved remediation completed and audited/);
  }

  const auditEntries = readFileSync(resolve(outputDirectory, 'actions-audit.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    auditEntries.map(({ ticket, status }) => ({ ticket, status })),
    [
      { ticket: 'CHG-12345', status: 'approved' },
      { ticket: 'CHG-12345', status: 'started' },
      { ticket: 'CHG-12345', status: 'succeeded' },
      { ticket: 'INC-67890', status: 'approved' },
      { ticket: 'INC-67890', status: 'started' },
      { ticket: 'INC-67890', status: 'succeeded' },
    ],
  );
  const terminalEntries = auditEntries.filter((entry) => entry.status === 'succeeded');
  assert.ok(terminalEntries.every((entry) => entry.action === 'migrate-vm-size'));
  assert.ok(terminalEntries.every((entry) => entry.scope === 'all-retiring-vms'));
  assert.ok(terminalEntries.every((entry) => entry.completedVms === 2));
  assert.equal(readFileSync(tracePath, 'utf8').trim().split('\n').length, 4);
});

test('PowerShell approval gate audits an approved no-op migration', (t) => {
  const outputDirectory = createTemporaryAuditDirectory(t);
  const fixtureDirectory = capsulePath('tests/fixtures/az-success');
  const result = run(
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
      '-Action',
      'migrate-vm-size',
      '-ChangeTicket',
      'CHG-24680',
    ],
    {
      env: {
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        SRE_OUTPUT_DIR: outputDirectory,
        AZ_SUCCESS_EMPTY: '1',
      },
      input: 'APPROVE\n',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing to migrate/);
  const entries = readFileSync(resolve(outputDirectory, 'actions-audit.log'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(entries.map((entry) => entry.status), ['approved', 'started', 'succeeded']);
  assert.equal(entries[2].ticket, 'CHG-24680');
  assert.equal(entries[2].completedVms, 0);
});

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/tools/invoke-approved-remediation.sh'),
      '--action',
      'migrate-vm-size',
      '--change-ticket',
      'CHG-13579',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
      '-Action',
      'migrate-vm-size',
      '-ChangeTicket',
      'INC-97531',
    ],
  ],
]) {
  test(`${label} approval gate records partial migration failure before propagating it`, (t) => {
    const outputDirectory = createTemporaryAuditDirectory(t);
    const fixtureDirectory = capsulePath('tests/fixtures/az-success');
    const tracePath = resolve(outputDirectory, 'az-partial.log');
    const result = run(command, arguments_, {
      env: {
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        SRE_OUTPUT_DIR: outputDirectory,
        AZ_SUCCESS_TRACE: tracePath,
        AZ_SUCCESS_FAIL_VM: 'srelabretirement-legacy-02',
      },
      input: 'APPROVE\n',
    });

    assert.notEqual(result.status, 0);
    const auditEntries = readFileSync(resolve(outputDirectory, 'actions-audit.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(auditEntries.map((entry) => entry.status), ['approved', 'started', 'failed']);
    assert.equal(auditEntries[2].completedVms, 1);
    assert.equal(auditEntries[2].failedVm, 'srelabretirement-legacy-02');
    assert.equal(auditEntries[2].exitCode, 23);
    assert.match(`${result.stdout}\n${result.stderr}`, /completed 1[\s\S]*srelabretirement-legacy-02/i);
  });
}

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [capsulePath('scripts/inject.sh')],
  ],
  [
    'PowerShell',
    'pwsh',
    ['-NoProfile', '-File', capsulePath('scripts/inject.ps1')],
  ],
]) {
  test(`${label} injector waits for every VM to deallocate before reporting readiness`, (t) => {
    const temporaryRoot = mkdtempSync(capsulePath('tests', 'inject-'));
    const fixtureDirectory = capsulePath('tests/fixtures/az-inject');
    const tracePath = resolve(temporaryRoot, 'az-inject.log');
    t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

    const result = run(command, arguments_, {
      env: {
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        AZ_INJECT_TRACE: tracePath,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Simulated Azure Service Health advisory/);
    const deallocatedWaits = readFileSync(tracePath, 'utf8')
      .split('\n')
      .filter((line) => line.includes('vm wait') && line.includes('--deallocated'));
    assert.equal(deallocatedWaits.length, 3);
  });

  test(`${label} injector propagates a deallocated wait failure without reporting readiness`, (t) => {
    const temporaryRoot = mkdtempSync(capsulePath('tests', 'inject-'));
    const fixtureDirectory = capsulePath('tests/fixtures/az-inject');
    const tracePath = resolve(temporaryRoot, 'az-inject.log');
    t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

    const result = run(command, arguments_, {
      env: {
        PATH: `${fixtureDirectory}:${process.env.PATH}`,
        AZ_INJECT_TRACE: tracePath,
        AZ_INJECT_FAIL_DEALLOCATED: '1',
      },
    });

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /Simulated Azure Service Health advisory/);
    assert.match(`${result.stdout}\n${result.stderr}`, /deallocated wait failure|failed with exit code 42/i);
  });
}

for (const [label, command, arguments_] of [
  [
    'Bash',
    'bash',
    [
      capsulePath('scripts/tools/invoke-approved-remediation.sh'),
      '--action',
      'migrate-vm-size',
      '--change-ticket',
      'not-a-ticket',
    ],
  ],
  [
    'PowerShell',
    'pwsh',
    [
      '-NoProfile',
      '-File',
      capsulePath('scripts/tools/Invoke-ApprovedRemediation.ps1'),
      '-Action',
      'migrate-vm-size',
      '-ChangeTicket',
      'not-a-ticket',
    ],
  ],
]) {
  test(`${label} approval gate rejects an invalid change ticket before remediation`, () => {
    const result = run(command, arguments_);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ChangeTicket must match CHG-12345 or INC-12345/);
  });
}
