@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Register-Collector.ps1"
if errorlevel 1 exit /b 1
start "" "%~dp0preview.html"
