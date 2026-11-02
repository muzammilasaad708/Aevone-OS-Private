@echo off
cd /d "%~dp0"
if not exist "web\config.js" (
 echo AEVONE OS public configuration is missing.
 call CONFIGURE_AEVONE_OS.bat
)
if not exist "web\config.js" (
 echo Setup incomplete. Please add the public Supabase key.
 pause
 exit /b 1
)
where py >nul 2>nul
if %errorlevel%==0 (
 py -3 tools\launch.py
) else (
 python tools\launch.py
)
if errorlevel 1 echo Check Python 3.10+ installation and restart.
pause
