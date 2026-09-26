@echo off
setlocal
cd /d "%~dp0"
REM Open a dedicated console so double-click keeps the daemon visible.
start "agentmemory-portable" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
exit /b 0
