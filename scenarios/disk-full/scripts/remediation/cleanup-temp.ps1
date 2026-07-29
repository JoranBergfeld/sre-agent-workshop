# Broad Temp remediation. Stops the diskfill process if present and clears
# everything under C:\Temp — useful when the agent isn't allowed to delete
# arbitrary paths but can trigger an approved Temp-folder cleanup.
param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$script = @'
if (Test-Path 'C:\Temp\diskfill.pid') {
  $workloadPid = Get-Content -Path 'C:\Temp\diskfill.pid' -ErrorAction SilentlyContinue
  if ($workloadPid) {
    Stop-Process -Id $workloadPid -Force -ErrorAction SilentlyContinue
  }
  Remove-Item 'C:\Temp\diskfill.pid' -Force -ErrorAction SilentlyContinue
}

$removed = 0
$failed = 0
Get-ChildItem -Path 'C:\Temp' -Force -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction Stop
    $removed++
  } catch {
    $failed++
  }
}

Write-Output ("Temp cleanup completed: path=C:\Temp removed={0} failed={1}" -f $removed, $failed)
'@

& "$PSScriptRoot\..\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
