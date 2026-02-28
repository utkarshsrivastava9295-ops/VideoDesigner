@echo off
title Music Video Generator
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install. Check Node.js is installed.
    pause
    exit /b 1
  )
)

echo Starting Music Video Generator...
call npm run electron:dev
if errorlevel 1 pause
