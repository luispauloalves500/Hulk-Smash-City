@echo off
setlocal
cd /d "%~dp0"
title Instalar efeitos gratuitos Kenney - HULK SMASH CITY
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR-AUDIO-KENNEY.ps1"
echo.
echo Pressione uma tecla para fechar.
pause >nul
