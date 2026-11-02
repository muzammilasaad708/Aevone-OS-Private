@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 tools\configure.py) else (python tools\configure.py)
echo.
pause
