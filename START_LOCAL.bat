@echo off
setlocal
cd /d "%~dp0"
where npx >nul 2>&1
if errorlevel 1 (
  echo Node.js/npm was not found. Install Node.js first.
  pause
  exit /b 1
)
echo Starting TTT-OS locally with Vercel's local emulator.
echo First run may ask you to sign in/link this folder to the existing Vercel project.
call npx vercel dev
pause
