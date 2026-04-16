@echo off
:: ============================================================
:: GammaTR — watch.bat
:: Auto-save watcher: servidor local + git auto-commit/push
:: Lee el nombre del repo desde config.txt para ser reutilizable
:: en cualquier proyecto.
::
:: REQUISITOS (instalar una vez):
::   npm install -g live-server chokidar-cli
::   O si no tienes npm: python -m http.server 8080
:: ============================================================

setlocal EnableDelayedExpansion

:: Leer nombre del repo desde config.txt
set "REPO_NAME="
if exist config.txt (
    set /p REPO_NAME=<config.txt
    :: Limpiar espacios y saltos de línea
    for /f "tokens=* delims= " %%a in ("%REPO_NAME%") do set REPO_NAME=%%a
)

if "%REPO_NAME%"=="" (
    echo [ERROR] No se encontro config.txt o esta vacio.
    echo Crea un archivo config.txt con el nombre del repositorio.
    pause
    exit /b 1
)

echo ============================================================
echo  GammaTR Auto-Save Watcher
echo  Repo: %REPO_NAME%
echo  Directorio: %CD%
echo ============================================================
echo.

:: Verificar que estamos en un repo git
git status >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Este directorio no es un repositorio git.
    echo Ejecuta primero setup-repo.bat
    pause
    exit /b 1
)

:: ===== INICIAR SERVIDOR LOCAL =====
echo [Servidor] Iniciando en http://localhost:8080 ...
echo.

:: Intentar live-server primero, si no python
where live-server >nul 2>&1
if not errorlevel 1 (
    echo [Servidor] Usando live-server...
    start /b cmd /c "live-server --port=8080 --no-browser 2>&1"
) else (
    where python >nul 2>&1
    if not errorlevel 1 (
        echo [Servidor] Usando Python http.server...
        start /b cmd /c "python -m http.server 8080 2>&1"
    ) else (
        where python3 >nul 2>&1
        if not errorlevel 1 (
            start /b cmd /c "python3 -m http.server 8080 2>&1"
        ) else (
            echo [WARN] No se encontro live-server ni python.
            echo Instala: npm install -g live-server
        )
    )
)

timeout /t 2 /nobreak >nul
echo [Servidor] Abierto en: http://localhost:8080
start http://localhost:8080
echo.

:: ===== WATCHER DE ARCHIVOS =====
echo [Watcher] Observando cambios en archivos...
echo [Watcher] Ctrl+C para detener.
echo.

:: Función de auto-commit
:: Usamos chokidar-cli si está disponible, si no polling manual
where chokidar >nul 2>&1
if not errorlevel 1 (
    echo [Watcher] Usando chokidar-cli...
    chokidar "**/*.html" "**/*.css" "**/*.js" "**/*.json" --ignore "node_modules/**" -c "call :do_commit"
) else (
    echo [Watcher] chokidar no encontrado. Usando polling cada 10 segundos.
    echo Instala: npm install -g chokidar-cli
    echo.
    :polling_loop
    timeout /t 10 /nobreak >nul
    call :do_commit
    goto polling_loop
)

goto :eof

:: ===== FUNCIÓN DE COMMIT =====
:do_commit
    :: Comprobar si hay cambios
    git diff --quiet --exit-code && git diff --cached --quiet --exit-code
    if errorlevel 1 (
        :: Obtener hora actual
        for /f "tokens=1-3 delims=:." %%a in ("%TIME%") do (
            set HH=%%a
            set MM=%%b
            set SS=%%c
        )
        :: Eliminar espacio inicial si la hora es < 10
        set HH=%HH: =%
        if "!HH!"=="" set HH=0
        set TIMESTAMP=!HH!:!MM!:!SS!

        set "COMMIT_MSG=auto-save [%REPO_NAME%]: !TIMESTAMP!"

        echo [Git] Guardando cambios: !COMMIT_MSG!
        git add .
        git commit -m "!COMMIT_MSG!" >nul 2>&1

        :: Push a origin
        git push origin HEAD >nul 2>&1
        if errorlevel 1 (
            echo [Git] Push fallido - puede que la rama remota no exista todavia
            echo [Git] Intenta: git push -u origin gh-pages
        ) else (
            echo [Git] Push exitoso ✓
        )
    )
    goto :eof
