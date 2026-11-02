@echo off
setlocal
cd /d "%~dp0"
where pnpm >nul 2>nul
if errorlevel 1 (
  echo Run setup-project.cmd first, then open a new Command Prompt.
  exit /b 1
)
if not exist "node_modules" (
  call pnpm install --frozen-lockfile
  if errorlevel 1 exit /b 1
)
echo Open http://localhost:5173 after both servers are ready.
echo Keep this Command Prompt open. Press Ctrl+C to stop the project.
call pnpm dev
