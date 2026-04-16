@echo off
:: ============================================================
:: GammaTR — setup-repo.bat
:: Inicializa el repositorio git, crea rama gh-pages y hace push.
:: Ejecutar UNA SOLA VEZ al comenzar el proyecto.
:: ============================================================

setlocal EnableDelayedExpansion

:: Leer nombre del repo desde config.txt
set "REPO_NAME="
if exist config.txt (
    set /p REPO_NAME=<config.txt
    for /f "tokens=* delims= " %%a in ("%REPO_NAME%") do set REPO_NAME=%%a
)

if "%REPO_NAME%"=="" (
    echo [ERROR] config.txt no encontrado o vacio.
    pause
    exit /b 1
)

set "GITHUB_USER=looperjajo"
set "REMOTE_URL=https://github.com/%GITHUB_USER%/%REPO_NAME%.git"

echo ============================================================
echo  GammaTR — Setup de Repositorio
echo  Usuario: %GITHUB_USER%
echo  Repo:    %REPO_NAME%
echo  URL:     %REMOTE_URL%
echo ============================================================
echo.
echo ADVERTENCIA: Este script inicializa git y hace el primer push.
echo Asegurate de haber creado el repo vacio en GitHub primero:
echo   https://github.com/new
echo.
pause

:: ===== PASO 1: git init =====
echo [1/5] Inicializando git...
git init
if errorlevel 1 (
    echo [ERROR] git init fallo
    pause
    exit /b 1
)
echo ✓ git init OK
echo.

:: ===== PASO 2: Crear .gitignore si no existe =====
if not exist .gitignore (
    echo [2/5] Creando .gitignore...
    (
        echo .env
        echo *.key
        echo *.pem
        echo node_modules/
        echo .DS_Store
        echo Thumbs.db
    ) > .gitignore
    echo ✓ .gitignore creado
) else (
    echo [2/5] .gitignore ya existe - OK
)
echo.

:: ===== PASO 3: Configurar remote =====
echo [3/5] Configurando remote origin...
git remote remove origin 2>nul
git remote add origin %REMOTE_URL%
if errorlevel 1 (
    echo [ERROR] No se pudo añadir remote
    pause
    exit /b 1
)
echo ✓ Remote origin: %REMOTE_URL%
echo.

:: ===== PASO 4: Crear rama gh-pages =====
echo [4/5] Creando rama gh-pages...
git checkout -b gh-pages 2>nul
if errorlevel 1 (
    git checkout gh-pages 2>nul
    if errorlevel 1 (
        echo [ERROR] No se pudo crear/cambiar a gh-pages
        pause
        exit /b 1
    )
)
echo ✓ Rama gh-pages activa
echo.

:: ===== PASO 5: Primer commit y push =====
echo [5/5] Primer commit y push...
git add .
git commit -m "feat: initial GammaTR PWA setup"
if errorlevel 1 (
    echo [ERROR] Commit fallo (puede que no haya archivos)
    pause
    exit /b 1
)

git push -u origin gh-pages
if errorlevel 1 (
    echo.
    echo [ERROR] Push fallo. Posibles causas:
    echo  - El repo no existe en GitHub (crealo en https://github.com/new)
    echo  - No tienes credenciales configuradas (git config --global user.name/email)
    echo  - El repo ya tiene commits (intenta: git pull --rebase origin gh-pages)
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  SETUP COMPLETADO ✓
echo ============================================================
echo.
echo  Tu app estara disponible en:
echo  https://%GITHUB_USER%.github.io/%REPO_NAME%/
echo.
echo  NOTA: GitHub Pages puede tardar 1-2 minutos en activarse.
echo  Ve a: https://github.com/%GITHUB_USER%/%REPO_NAME%/settings/pages
echo  y asegurate de que la fuente es la rama gh-pages.
echo.
echo  Para iniciar el auto-save, ejecuta: watch.bat
echo ============================================================
pause
