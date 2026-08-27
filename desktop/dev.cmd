@echo off
setlocal
where node >nul 2>nul
if not errorlevel 1 (
  node "%~dp0dev.mjs"
) else (
  "%~dp0..\tools\node-v22.18.0-win-x64\node.exe" "%~dp0dev.mjs"
)
