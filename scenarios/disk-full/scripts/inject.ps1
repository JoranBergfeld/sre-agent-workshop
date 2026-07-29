# Scenario 1 — Disk Full.
# Iteratively fills C:\Temp\diskfill\*.bin with 1GB files until the disk is full,
# so the agent can attribute pressure to the Temp folder during investigation.
param(
    [string]$ResourceGroup = "rg-srelabdiskfull",
    [string]$VmName = "srelabdiskfull-vm01"
)

$loopCommand = @'
New-Item -Path "C:\Temp\diskfill" -ItemType Directory -Force | Out-Null
$i = 0
$chunkBytes = 1GB
while ($true) {
  $filePath = ("C:\Temp\diskfill\fill-{0:D5}.bin" -f $i)
  fsutil file createnew $filePath $chunkBytes | Out-Null
  if ($LASTEXITCODE -ne 0) { break }
  $i++
}
Set-Content -Path "C:\Temp\diskfill.complete" -Value ("Created {0}x1GB files in C:\Temp\diskfill" -f $i) -Encoding ASCII
'@

$encodedLoop = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loopCommand))
$script = "New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null; `$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedLoop' -WindowStyle Hidden -PassThru; Set-Content -Path 'C:\Temp\diskfill.pid' -Value `$proc.Id -Encoding ASCII; Write-Output ('Started iterative disk fill loop in C:\Temp with PID {0}' -f `$proc.Id)"

& "$PSScriptRoot\..\tools\Invoke-VmRunCommand.ps1" -ResourceGroup $ResourceGroup -VmName $VmName -Script $script
