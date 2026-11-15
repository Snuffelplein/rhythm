@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installeer eerst de pakketten met npm.cmd install.
  pause
  exit /b 1
)
echo Rhythm bouwen...
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Rhythm starten op http://127.0.0.1:5173
call npm.cmd run preview -- --port 5173 --strictPort --open /?v=0.5.0
pause
