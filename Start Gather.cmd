@echo off
title Gather - Employee Dashboard
cd /d "%~dp0"
if not exist "node_modules\next\dist\bin\next" (
  echo Installing project dependencies...
  call npm.cmd ci
  if errorlevel 1 goto failed
)
echo.
echo Gather will be available at http://localhost:5190
echo Keep this window open while using the application.
echo.
call npm.cmd run dev
goto done
:failed
echo Unable to install dependencies. Make sure Node.js 20.9 or newer is installed.
:done
pause
