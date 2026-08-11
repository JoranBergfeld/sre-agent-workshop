import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const scenariosRoot = resolve(repositoryRoot, 'scenarios');

function scriptsUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return /[/\\]tests?([/\\]|$)/.test(path) ? [] : scriptsUnder(path);
    return /\.(?:sh|ps1)$/.test(entry.name) ? [path] : [];
  });
}

test('Azure-touching scenario scripts select and verify their subscription directly', () => {
  const failures = [];

  for (const path of scriptsUnder(scenariosRoot)) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /azure-subscription\.(?:sh|ps1)|Select-AzureSubscription|select_azure_subscription/);

    const invokesAzure = /(?:^|[;&|]\s*|[=(]\s*|\$\()&?\s*az\s+(?!account\s+(?:set|show)\b)/m.test(source);
    if (invokesAzure && (!/az account set --subscription/.test(source) || !/az account show/.test(source))) {
      failures.push(path.replace(`${repositoryRoot}/`, ''));
    }
  }

  assert.deepEqual(failures, []);
});

test('scenario PowerShell scripts parse successfully', () => {
  const paths = scriptsUnder(scenariosRoot).filter((path) => path.endsWith('.ps1'));
  const parser = `
$failures = @()
$paths = $env:SCENARIO_PS_PATHS | ConvertFrom-Json
foreach ($path in $paths) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    $path,
    [ref]$tokens,
    [ref]$errors
  ) | Out-Null
  foreach ($error in $errors) {
    $failures += "\${path}:$($error.Extent.StartLineNumber): $($error.Message)"
  }
}
if ($failures.Count -gt 0) {
  $failures | Write-Error
  exit 1
}
`;
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', parser], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCENARIO_PS_PATHS: JSON.stringify(paths),
    },
  });

  assert.equal(result.status, 0, result.stderr);
});

test('IIS app-pool remediation contains one command body', () => {
  const path = resolve(
    scenariosRoot,
    'iis-app-pool/scripts/remediation/start-iis-app-pool.ps1'
  );
  const source = readFileSync(path, 'utf8');

  assert.equal(source.match(/^param\(/gm)?.length, 1);
  assert.equal(source.match(/Invoke-VmRunCommand\.ps1/g)?.length, 1);
});
