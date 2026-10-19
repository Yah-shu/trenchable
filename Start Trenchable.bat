@echo off
rem Double-click to start Trenchable. Close this window to stop it.
cd /d "%~dp0"
title Trenchable
where bun >nul 2>nul || (echo Bun is not installed. Get it from https://bun.sh, then try again. & pause & exit /b 1)
where npm >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org, then try again. & pause & exit /b 1)
if not exist node_modules (
  echo First start: installing what Trenchable needs. This takes a few minutes...
  call npm install || (echo The install failed. & pause & exit /b 1)
)
echo Starting Trenchable... (your browser opens in a moment; close this window to stop)
npm run dev
