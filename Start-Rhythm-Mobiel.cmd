@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installeer eerst de pakketten met npm.cmd install.
  pause
  exit /b 1
)
echo Rhythm voor mobiel testen starten...
call npm.cmd run dev:mobile
pause
