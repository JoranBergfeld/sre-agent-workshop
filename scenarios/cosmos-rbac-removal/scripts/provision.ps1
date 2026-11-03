# Provision cosmos-rbac-removal infrastructure with bounded, policy-driven region and VM
# family fallback (infra/placement.json). Existing deployments stay pinned to
# their region. Options: scripts/placement/provision.mjs --help
$ErrorActionPreference = 'Stop'

$scenario = 'cosmos-rbac-removal'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$engine = Join-Path $repoRoot 'scripts/placement/provision.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 20 or later is required (it runs the shared placement engine).'
    exit 1
}
if ($args.Count -gt 0 -and $args[0] -in @('-h', '--help')) {
    & node $engine --help
    exit $LASTEXITCODE
}

& node $engine deploy $scenario @args
exit $LASTEXITCODE
