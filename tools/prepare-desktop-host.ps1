param(
  [string]$ElectronExe = (Join-Path $PSScriptRoot '..\node_modules\.pnpm\electron@28.3.3_supports-color@7.2.0\node_modules\electron\dist\electron.exe'),
  [string]$Icon = (Join-Path $PSScriptRoot '..\assets\app-icon.ico'),
  [string]$Rcedit = (Join-Path $PSScriptRoot '..\node_modules\.pnpm\electron-winstaller@5.4.0_supports-color@7.2.0\node_modules\electron-winstaller\vendor\rcedit.exe')
)

$hostPath = Join-Path (Split-Path $ElectronExe) 'BQTimer.exe'
Copy-Item -LiteralPath $ElectronExe -Destination $hostPath -Force
& $Rcedit $hostPath --set-icon $Icon
if ($LASTEXITCODE -ne 0) { throw "Could not write the desktop host icon (exit $LASTEXITCODE)." }
Write-Output $hostPath
