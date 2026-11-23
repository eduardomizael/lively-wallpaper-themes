@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-install.ps1" %*
set "resultado=%errorlevel%"
if "%~1"=="" pause
exit /b %resultado%

