# Run in an elevated Windows PowerShell. Uses the existing NSSM installation.
[CmdletBinding()]
param(
    [string]$ProjectPath = (Join-Path $PSScriptRoot '..\..'),
    [string]$NssmPath = '',
    [string]$NodePath = '',
    [ValidatePattern('^[A-Za-z0-9_-]+$')]
    [string]$ServiceName = 'TravelItineraryMap',
    [ValidateRange(1024, 65535)]
    [int]$Port = 6001
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Open Windows PowerShell as administrator, then run this script again.'
}
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
if (!$NssmPath) {
    $command = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if (!$command) { throw 'NSSM is not on PATH. Pass -NssmPath with the full path to your existing nssm.exe.' }
    $NssmPath = $command.Source
}
if (!$NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$script:NssmExecutable = (Resolve-Path -LiteralPath $NssmPath).Path
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
$entry = Join-Path $ProjectPath 'server\index.js'
foreach ($required in @($entry, (Join-Path $ProjectPath 'client\dist\index.html'), (Join-Path $ProjectPath 'node_modules\express\package.json'), (Join-Path $ProjectPath '.env'))) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing $required. Run npm ci, create .env, and run npm run build first." }
}
function Invoke-Nssm {
    & $script:NssmExecutable @args
    if ($LASTEXITCODE -ne 0) { throw "NSSM command failed (exit $LASTEXITCODE). Check the output above." }
}
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    $parameters = Get-ItemProperty -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters" -ErrorAction Stop
    if ($parameters.AppDirectory -ne $ProjectPath -or $parameters.Application -ne $NodePath) {
        throw "Service $ServiceName belongs to another application or Node path. No changes made. Choose another -ServiceName or use the original -NodePath."
    }
    Stop-Service -Name $ServiceName
    (Get-Service -Name $ServiceName).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}
# LocalService can read the app and write only runtime data/log folders.
$logs = Join-Path $ProjectPath 'logs'
$data = Join-Path $ProjectPath 'data'
New-Item -ItemType Directory -Path $logs, $data -Force | Out-Null
& icacls.exe $ProjectPath /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant LocalService read access to the project.' }
foreach ($writable in @($logs, $data)) {
    & icacls.exe $writable /grant '*S-1-5-19:(OI)(CI)M' /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant LocalService write access to $writable." }
}
if (!$existing) { Invoke-Nssm install $ServiceName $NodePath }
Invoke-Nssm set $ServiceName AppDirectory $ProjectPath
Invoke-Nssm set $ServiceName AppParameters ('"' + $entry + '"')
Invoke-Nssm set $ServiceName DisplayName 'Travel Itinerary Map'
Invoke-Nssm set $ServiceName Description 'Travel planner for 19991115.xyz'
Invoke-Nssm set $ServiceName ObjectName 'NT AUTHORITY\LocalService'
Invoke-Nssm set $ServiceName Start SERVICE_DELAYED_AUTO_START
# This service uses the local data folder even if another process has DATA_DIR set.
Invoke-Nssm set $ServiceName AppEnvironmentExtra 'NODE_ENV=production' "PORT=$Port" 'DATA_DIR=./data'
Invoke-Nssm set $ServiceName AppExit Default Restart
Invoke-Nssm set $ServiceName AppRestartDelay 5000
Invoke-Nssm set $ServiceName AppStdout (Join-Path $logs 'stdout.log')
Invoke-Nssm set $ServiceName AppStderr (Join-Path $logs 'stderr.log')
Invoke-Nssm set $ServiceName AppRotateFiles 1
Invoke-Nssm set $ServiceName AppRotateOnline 1
Invoke-Nssm set $ServiceName AppRotateBytes 10485760
Start-Service -Name $ServiceName
(Get-Service -Name $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
Write-Host "Installed $ServiceName with delayed automatic startup (LocalService)."
Write-Host "Local check: http://localhost:$Port/api/health"
Write-Host 'Public address: https://19991115.xyz (configure your existing proxy upstream)'
Write-Host "Logs: $logs"
