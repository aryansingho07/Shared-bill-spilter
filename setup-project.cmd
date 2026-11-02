@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required. Install Node.js, then run this file again.
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo Installing pnpm...
  call npm install --global pnpm@11.25.0
  if errorlevel 1 exit /b 1
  set "PATH=%APPDATA%\npm;%PATH%"
)
call pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
echo.
echo Dependencies are ready. Run start-project.cmd to launch the app.
