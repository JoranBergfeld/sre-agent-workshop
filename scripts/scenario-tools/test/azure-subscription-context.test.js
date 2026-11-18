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
    // cli.test.js creates short-lived temp-capsule-* directories in parallel runs.
    if (entry.isDirectory()) return /[/\\]tests?([/\\]|$)/.test(path) || entry.name.startsWith('temp-capsule-') || entry.name === 'node_modules' ? [] : scriptsUnder(path);
    return /\.(?:sh|ps1)$/.test(entry.name) ? [path] : [];
  });
}

function learnerScripts(extension) {
  return [...scriptsUnder(scenariosRoot), ...scriptsUnder(resolve(repositoryRoot, 'scripts'))].filter((path) => path.endsWith(extension));
}

test('Azure-touching scenario scripts verify subscription context or pass explicit subscription scope', () => {
  const failures = [];

  for (const path of scriptsUnder(scenariosRoot)) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /azure-subscription\.(?:sh|ps1)|Select-AzureSubscription|select_azure_subscription/);

    const invokesAzure = /(?:^|[;&|]\s*|[=(]\s*|\$\()&?\s*az\s+(?!account\s+(?:set|show)\b)/m.test(source);
    const directCommands = source.match(/(?:^|[;&|]\s*|[=(]\s*|\$\()&?\s*az\s+(?!account\s+(?:set|show)\b)[^\r\n]*/gm) || [];
    const passesExplicitScope = directCommands.length > 0 && directCommands.every(command => /--subscription\s+/.test(command));
    if (invokesAzure && !passesExplicitScope && (!/az account set --subscription/.test(source) || !/az account show/.test(source))) {
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

test('PowerShell scripts tell Windows PowerShell 5.1 users to run PowerShell 7', () => {
  const paths = learnerScripts('.ps1');
  const failures = [];

  for (const path of paths) {
    const relativePath = path.replace(`${repositoryRoot}/`, '');
    const source = readFileSync(path);
    if (!/^#Requires -Version 7\.0\r?$/m.test(source.toString('utf8'))) {
      failures.push(`${relativePath}: add #Requires -Version 7.0`);
    }
    if (source.some((byte) => byte > 0x7f)) {
      failures.push(`${relativePath}: use ASCII text; Windows PowerShell 5.1 reads UTF-8 without a BOM as ANSI and fails to parse`);
    }
  }

  // Windows PowerShell 5.1 reports parse errors before it honours #Requires.
  const finder = `
$paths = $env:SCENARIO_PS_PATHS | ConvertFrom-Json
foreach ($path in $paths) {
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$null)
  $ast.FindAll({
    param($node)
    ($node -is [System.Management.Automation.Language.BinaryExpressionAst] -and $node.Operator -eq 'QuestionQuestion') -or
    ($node -is [System.Management.Automation.Language.AssignmentStatementAst] -and $node.Operator -eq 'QuestionQuestionEquals') -or
    ($node -is [System.Management.Automation.Language.MemberExpressionAst] -and $node.NullConditional) -or
    ($node -is [System.Management.Automation.Language.IndexExpressionAst] -and $node.NullConditional) -or
    $node -is [System.Management.Automation.Language.TernaryExpressionAst] -or
    $node -is [System.Management.Automation.Language.PipelineChainAst]
  }, $true) | ForEach-Object { "$($path):$($_.Extent.StartLineNumber): replace PowerShell 7-only syntax: $($_.Extent.Text)" }
}
`;
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', finder], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SCENARIO_PS_PATHS: JSON.stringify(paths),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  failures.push(...result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.replace(`${repositoryRoot}/`, '')));
  assert.deepEqual(failures, []);
});

test('Bash scripts avoid syntax that macOS Bash 3.2 cannot run', () => {
  const unsupported = [
    [/^\s*(?:mapfile|readarray)\b/m, 'mapfile/readarray needs Bash 4'],
    [/\b(?:declare|local|typeset)\s+-[a-zA-Z]*A[a-zA-Z]*\b/, 'associative arrays need Bash 4'],
    [/\b(?:declare|local|typeset)\s+-[a-zA-Z]*n[a-zA-Z]*\b/, 'namerefs need Bash 4.3'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*(?:,,?|\^\^?)\}/, 'case-changing expansions need Bash 4'],
    [/\$\{[A-Za-z_][A-Za-z0-9_]*\[-\d+\]\}/, 'negative array indexes need Bash 4.3'],
    [/\|&|&>>/, '|& and &>> need Bash 4'],
    [/\bcoproc\b/, 'coproc needs Bash 4'],
    [/\[\[\s+-v\s/, '[[ -v ]] needs Bash 4.2'],
    [/\bwait\s+-n\b/, 'wait -n needs Bash 4.3'],
    [/\$\([^)\n]*(?<!<)<<(?!<)-?\s*['"]?\w+['"]?\s*$/m, 'Bash 3.2 misparses a heredoc inside $(...); capture it from a function instead'],
  ];
  const failures = [];

  for (const path of learnerScripts('.sh')) {
    const source = readFileSync(path, 'utf8');
    for (const [pattern, problem] of unsupported) {
      if (pattern.test(source)) failures.push(`${path.replace(`${repositoryRoot}/`, '')}: ${problem}`);
    }
  }

  assert.deepEqual(failures, []);
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
