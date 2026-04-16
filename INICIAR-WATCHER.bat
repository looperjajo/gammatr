@echo off
:: Lanza el watcher de PowerShell sin restricciones de política de ejecución
:: Doble clic para iniciar auto-save
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0watch.ps1"
pause
