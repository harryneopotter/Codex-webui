@echo off
echo Starting Codex WebUI...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM Set default environment variables if not set
if not defined HOST set HOST=127.0.0.1
if not defined PORT set PORT=5055

echo Starting server on http://%HOST%:%PORT%
echo Press Ctrl+C to stop the server
echo.

node server.js

pause
