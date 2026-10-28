# Scenario 1 — Arc-Enabled Server Disk Pressure.
# Iteratively fills C:\Temp\diskfill\*.bin with 1GB files until the disk is full,
# so the agent can attribute pressure to the Temp folder during investigation.
param(
    [string]$ResourceGroup = "rg-srelabarcdisk",
    [string]$VmName = "srelabarcdisk-vm01"
)
$requestedSubscriptionId = $env:AZURE_SUBSCRIPTION_ID; if ($requestedSubscriptionId) { az account set --subscription $requestedSubscriptionId; if ($LASTEXITCODE) { throw "Unable to select Azure subscription '$requestedSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" } }
$activeSubscriptionId = [string](az account show --query id -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionId) { throw "Azure CLI is not authenticated. Run 'az login'." }
$activeSubscriptionName = [string](az account show --query name -o tsv); if ($LASTEXITCODE -or -not $activeSubscriptionName) { throw "Unable to read the active Azure subscription." }
$activeSubscriptionId = $activeSubscriptionId.Trim(); $activeSubscriptionName = $activeSubscriptionName.Trim(); if ($requestedSubscriptionId -and $activeSubscriptionId -cne $requestedSubscriptionId) { throw "Azure subscription mismatch: requested '$requestedSubscriptionId', active '$activeSubscriptionId'. Run: az account set --subscription `"$requestedSubscriptionId`"" }; Write-Host "Azure subscription: $activeSubscriptionName ($activeSubscriptionId)"
$loopCommand = @'
New-Item -Path "C:\Temp\diskfill" -ItemType Directory -Force | Out-Null
$scenarioMarker = 'sre-agent-workshop/arc-disk-pressure/v1'
$pidPath = 'C:\Temp\diskfill.pid'
$markerPath = 'C:\Temp\diskfill.marker'
$i = 0
$chunkBytes = 512MB
$targetFreePercent = 8
$minimumFreeBytes = 2GB
try {
  Set-Content -Path $markerPath -Value $scenarioMarker -Encoding ASCII
  while ($true) {
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = 'C:'"
    if (-not $drive -or ($drive.FreeSpace - $chunkBytes) -lt $minimumFreeBytes -or (($drive.FreeSpace / $drive.Size) * 100) -le $targetFreePercent) { break }
    $filePath = ("C:\Temp\diskfill\fill-{0:D5}.bin" -f $i)
    fsutil file createnew $filePath $chunkBytes | Out-Null
    if ($LASTEXITCODE -ne 0) { break }
    $i++
  }
  $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID = 'C:'"
  if (-not $drive -or $drive.FreeSpace -lt $minimumFreeBytes) { throw 'Safety reserve would be violated.' }
  Set-Content -Path "C:\Temp\diskfill.complete" -Value ("Created {0}x512MB files; target was {1}% free with a 2GiB reserve" -f $i, $targetFreePercent) -Encoding ASCII
} finally {
  Remove-Item -Path $pidPath -Force -ErrorAction SilentlyContinue
}
'@

$encodedLoop = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($loopCommand))
$script = "New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null; `$proc = Start-Process -FilePath powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedLoop' -WindowStyle Hidden -PassThru; `$owner = [PSCustomObject]@{ scenario = 'arc-disk-pressure'; marker = 'sre-agent-workshop/arc-disk-pressure/v1'; processId = `$proc.Id; processName = 'powershell.exe'; encodedCommand = '$encodedLoop' }; `$owner | ConvertTo-Json -Compress | Set-Content -Path 'C:\Temp\diskfill.owner.json' -Encoding ASCII; Set-Content -Path 'C:\Temp\diskfill.pid' -Value `$proc.Id -Encoding ASCII; Write-Output ('Started owned arc-disk-pressure fill loop in C:\Temp with PID {0}' -f `$proc.Id)"

& "$PSScriptRoot\..\tools\Invoke-ArcRunCommand.ps1" -ResourceGroup $ResourceGroup -MachineName $VmName -Script $script
