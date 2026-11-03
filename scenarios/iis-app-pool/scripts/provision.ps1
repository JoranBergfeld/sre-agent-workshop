# Provision iis-app-pool infrastructure with bounded, policy-driven region and VM
# family fallback (infra/placement.json). Existing deployments stay pinned to
# their region. Options: scripts/placement/provision.mjs --help
$ErrorActionPreference = 'Stop'

$scenario = 'iis-app-pool'
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

$clearPassword = $false
if (-not $env:VM_ADMIN_PASSWORD) {
    $secure = Read-Host 'Windows VM admin password' -AsSecureString
    $env:VM_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
    $clearPassword = $true
}
try {
    & node $engine deploy $scenario --secure-param-env adminPassword=VM_ADMIN_PASSWORD @args
    exit $LASTEXITCODE
} finally {
    if ($clearPassword) { Remove-Item Env:VM_ADMIN_PASSWORD -ErrorAction SilentlyContinue }
}
