@echo off
setlocal
title Service Renewal Hub - Production Launcher

echo ===================================================
echo   Service Renewal Hub - Production Startup Script
echo ===================================================
echo.

:: 1. Check Dependencies
echo [INFO] Checking dependencies...

python --version >nul 2>&1
if errorlevel 1 goto :error_python

call npm --version >nul 2>&1
if errorlevel 1 goto :error_npm

if not exist "nginx-1.28.1\nginx.exe" goto :error_nginx

echo [OK] Dependencies found.
echo.

:: 2. Backend Setup
echo [INFO] Setting up Backend...
cd backend

if not exist "venv" (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
)

echo [INFO] Activating virtual environment...
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    goto :error_venv
)

echo [INFO] Installing/Updating requirements...
pip install -r requirements.txt >nul 2>&1
if errorlevel 1 (
    echo [WARN] First install attempt failed. Retrying...
    pip install -r requirements.txt
)

echo [INFO] Starting Backend Server (Port 8003)...
start /min "ServiceHub_Backend" cmd /k "title ServiceHub Backend && venv\Scripts\activate && uvicorn server:app --reload --host 0.0.0.0 --port 8003"

cd ..
echo [OK] Backend started.
echo.

:: 3. Frontend Setup
echo [INFO] Building Frontend...
cd frontend

if not exist "node_modules" (
    echo [INFO] Installing frontend dependencies...
    call npm install
)

if not exist "build" (
    echo [INFO] Creating production build...
    call npm run build
) else (
    echo [INFO] Build folder exists. Skipping build.
)

cd ..
echo [OK] Frontend built.
echo.

:: 4. Start Nginx
echo [INFO] Starting Nginx...
cd nginx-1.28.1

tasklist /FI "IMAGENAME eq nginx.exe" 2>NUL | find /I /N "nginx.exe" >NUL
if errorlevel 1 (
    start nginx.exe
) else (
    echo [INFO] Nginx is already running. Reloading config...
    nginx.exe -s reload
)

cd ..
echo [OK] Nginx started.
echo.

echo ===================================================
echo   System is running!
echo   
echo   Access the App: http://localhost
echo   
echo   To stop: Close the minimized windows and execute:
echo   cd nginx-1.28.1 ^& nginx.exe -s stop
echo ===================================================
echo.
pause
exit /b 0

:: Error Handlers
:error_python
echo.
echo [ERROR] Python is not installed or not in PATH.
echo Please install Python 3.9+ and try again.
echo.
pause
exit /b 1

:error_npm
echo.
echo [ERROR] Node.js (npm) is not installed or not in PATH.
echo Please install Node.js (LTS) and try again.
echo.
pause
exit /b 1

:error_nginx
echo.
echo [ERROR] Nginx executable not found in nginx-1.28.1 folder.
echo Please ensure 'nginx-1.28.1' folder exists in root.
echo.
pause
exit /b 1

:error_venv
echo.
echo [ERROR] Failed to activate venv.
echo.
pause
exit /b 1
