@echo off
title UT Schedule Planner

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed.
    echo Download it from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

:: Create venv if it doesn't exist
if not exist ".venv" (
    echo Setting up for first run...
    python -m venv .venv
)

:: Activate venv
call .venv\Scripts\activate.bat

:: Install dependencies if needed (check for flask as a proxy)
python -c "import flask" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing dependencies...
    pip install -r requirements.txt
    playwright install chromium
)

:: Open browser after a 2-second delay (non-blocking)
start /b "" pythonw -c "import time,webbrowser;time.sleep(2);webbrowser.open('http://localhost:5000')"

:: Start the server
python app.py
