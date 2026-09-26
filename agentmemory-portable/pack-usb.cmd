@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\pack-usb.ps1" %*
exit /b %ERRORLEVEL%
