# Scenario 1 — Disk Full.
# Iteratively fills C:\Temp\diskfill\*.bin with 1GB files until the disk is full,
# so the agent can attribute pressure to the Temp folder during investigation.
param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$loopCommand = @'
New-Item -Path "C:\Temp\diskfill" -ItemType Directory -Force | Out-Null
$scenarioMarker = 'sre-agent-workshop/disk-full/v1'
$pidPath = 'C:\Temp\diskfill.pid'
$markerPath = 'C:\Temp\diskfill.marker'
$i = 0
$chunkBytes = 1GB
try {
  Set-Content -Path $markerPath -Value $scenarioMarker -Encoding ASCII
  while ($true) {
    $filePath = ("C:\Temp\diskfill\fill-{0:D5}.bin" -f $i)
    fsutil file createnew $filePath $chunkBytes | Out-Null
    if ($LASTEXITCODE -ne 0) { break }
    $i++
  }
  Set-Content -Path "C:\Temp\diskfill.complete" -Value ("Created {0}x1GB files in C:\Temp\diskfill" -f $i) -Encoding ASCII
} finally {
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
}
'@

$encodedLoop = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loopCommand))
$script = "New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null; `$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedLoop' -WindowStyle Hidden -PassThru; `$owner = [PSCustomObject]@{ scenario = 'disk-full'; marker = 'sre-agent-workshop/disk-full/v1'; processId = `$proc.Id; processName = 'powershell.exe'; encodedCommand = '$encodedLoop' }; `$owner | ConvertTo-Json -Compress | Set-Content -Path 'C:\Temp\diskfill.owner.json' -Encoding ASCII; Set-Content -Path 'C:\Temp\diskfill.pid' -Value `$proc.Id -Encoding ASCII; Write-Output ('Started owned disk-full fill loop in C:\Temp with PID {0}' -f `$proc.Id)"

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
