@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel% equ 0 (
  py -3 launcher.py
) else (
  python launcher.py
)
if errorlevel 1 (
  echo.
  echo Startup failed. Read the error above. If Python is missing, install Python 3.10+ with PATH enabled.
  pause
)
