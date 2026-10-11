@echo off
rem Double-click to start Paisa. Bypasses the PowerShell script policy for this one script only.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
pause
