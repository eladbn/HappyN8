@echo off
rem Builds or updates HappyN8 in Docker. Usage: scripts\deploy.cmd [-Clean] [-Logs]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
exit /b %ERRORLEVEL%
