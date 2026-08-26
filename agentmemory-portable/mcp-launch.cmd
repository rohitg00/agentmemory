@echo off
setlocal
cd /d "%~dp0"
set "KIT=%~dp0"
set "KIT=%KIT:~0,-1%"
set "PATH=%KIT%\portable\node;%PATH%"
if not defined AGENTMEMORY_URL set "AGENTMEMORY_URL=http://127.0.0.1:3111"

if exist "%KIT%\..\dist\standalone.mjs" (
  "%KIT%\portable\node\node.exe" "%KIT%\..\dist\standalone.mjs"
  exit /b %ERRORLEVEL%
)

if exist "%KIT%\..\dist\cli.mjs" (
  "%KIT%\portable\node\node.exe" "%KIT%\..\dist\cli.mjs" mcp
  exit /b %ERRORLEVEL%
)

if exist "%KIT%\repo\dist\standalone.mjs" (
  "%KIT%\portable\node\node.exe" "%KIT%\repo\dist\standalone.mjs"
  exit /b %ERRORLEVEL%
)

if exist "%KIT%\repo\dist\cli.mjs" (
  "%KIT%\portable\node\node.exe" "%KIT%\repo\dist\cli.mjs" mcp
  exit /b %ERRORLEVEL%
)

if exist "%KIT%\repo\packages\mcp\bin.mjs" (
  "%KIT%\portable\node\node.exe" "%KIT%\repo\packages\mcp\bin.mjs"
  exit /b %ERRORLEVEL%
)

echo [agentmemory-portable] MCP entry non trovata. Esegui setup.cmd / update.cmd 1>&2
exit /b 1
