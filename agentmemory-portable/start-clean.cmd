@echo off
setlocal
cd /d "%~dp0"
REM Alias of start.cmd: leftover kit pids are always cleaned; Docker is never used.
start "agentmemory-portable" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
exit /b 0
