@echo off
chcp 65001 >nul
echo ==========================================
echo  MORPH - SETUP DE ESTRUTURA
echo ==========================================
echo.

set "BASE_DIR=C:\Users\Vinícius\OneDrive\Documentos\sistemasistema\morph\backend"

echo Criando pastas...
mkdir "%BASE_DIR%\config" 2>nul
mkdir "%BASE_DIR%\controllers" 2>nul
mkdir "%BASE_DIR%\middleware" 2>nul
mkdir "%BASE_DIR%\models" 2>nul
mkdir "%BASE_DIR%\services" 2>nul
mkdir "%BASE_DIR%\utils" 2>nul
mkdir "%BASE_DIR%\routes" 2>nul
mkdir "%BASE_DIR%\jobs" 2>nul
mkdir "%BASE_DIR%\logs" 2>nul
mkdir "%BASE_DIR%\uploads\temp" 2>nul

echo Pastas criadas!
echo.
echo Agora execute: node create-files.js
pause