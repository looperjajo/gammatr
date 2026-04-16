# ============================================================
# GammaTR — watch.ps1
# Auto-commit + push cada vez que se guarda un archivo.
# No requiere instalar nada — usa .NET FileSystemWatcher nativo.
#
# Uso: clic derecho en watch.ps1 → "Ejecutar con PowerShell"
#      O desde terminal: powershell -ExecutionPolicy Bypass -File watch.ps1
# ============================================================

Set-Location $PSScriptRoot

# Leer nombre del repo desde config.txt
$repoName = (Get-Content "config.txt" -ErrorAction SilentlyContinue).Trim()
if (-not $repoName) { $repoName = "gammatr" }

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " GammaTR Auto-Save Watcher" -ForegroundColor Cyan
Write-Host " Repo: $repoName" -ForegroundColor Cyan
Write-Host " Dir:  $PSScriptRoot" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Comprobar que es un repo git
$gitCheck = git status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] No es un repositorio git. Ejecuta setup-repo.bat primero." -ForegroundColor Red
    pause
    exit 1
}

# Arrancar servidor local en background (Python si está disponible)
$serverPort = 8080
$pythonCmd = $null
foreach ($cmd in @("python", "python3", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd
        break
    }
}

if ($pythonCmd) {
    Write-Host "[Servidor] Iniciando en http://localhost:$serverPort con $pythonCmd..." -ForegroundColor Green
    Start-Process $pythonCmd -ArgumentList "-m http.server $serverPort" -WindowStyle Hidden
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:$serverPort"
} else {
    Write-Host "[Servidor] Python no encontrado. Solo autoguardado activo." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[Watcher] Observando cambios... (Ctrl+C para detener)" -ForegroundColor Green
Write-Host ""

# ===== FileSystemWatcher =====
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $PSScriptRoot
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

# Extensiones a vigilar
$watcher.Filter = "*.*"
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite

# Timer de debounce: esperar 2s tras el último cambio antes de hacer commit
# (evita múltiples commits por un solo guardado)
$debounceTimer = New-Object System.Timers.Timer
$debounceTimer.Interval = 2000
$debounceTimer.AutoReset = $false

# Extensiones ignoradas
$ignoredExts = @(".git", "node_modules", ".tmp", ".swp", "~")
$ignoredFiles = @("watch.ps1")

$lastCommitTime = [DateTime]::MinValue

$commitAction = {
    $now = [DateTime]::Now
    # Cooldown mínimo de 3 segundos entre commits
    if (($now - $script:lastCommitTime).TotalSeconds -lt 3) { return }

    Set-Location $PSScriptRoot

    # Comprobar si hay cambios reales
    $status = git status --porcelain 2>&1
    if (-not $status) { return }

    $timestamp = $now.ToString("HH:mm:ss")
    $msg = "auto-save [$using:repoName]: $timestamp"

    Write-Host "[Git] $msg" -ForegroundColor DarkCyan

    git add . 2>&1 | Out-Null
    git commit -m $msg 2>&1 | Out-Null
    $pushResult = git push 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[Git] Push exitoso ✓  ($timestamp)" -ForegroundColor Green
    } else {
        Write-Host "[Git] Push fallido: $pushResult" -ForegroundColor Red
    }

    $script:lastCommitTime = $now
}

# Cuando el timer expira, hacer commit
Register-ObjectEvent $debounceTimer Elapsed -Action $commitAction | Out-Null

# Cuando hay un cambio, reiniciar el timer de debounce
$changeAction = {
    $path = $Event.SourceEventArgs.FullPath

    # Ignorar archivos del sistema y .git
    foreach ($ignore in $ignoredExts) {
        if ($path -like "*$ignore*") { return }
    }
    foreach ($ignore in $ignoredFiles) {
        if ($path -like "*$ignore") { return }
    }

    # Reiniciar el debounce timer
    $debounceTimer.Stop()
    $debounceTimer.Start()
}

Register-ObjectEvent $watcher Changed -Action $changeAction | Out-Null
Register-ObjectEvent $watcher Created -Action $changeAction | Out-Null
Register-ObjectEvent $watcher Deleted -Action $changeAction | Out-Null
Register-ObjectEvent $watcher Renamed -Action $changeAction | Out-Null

Write-Host "Listo. Guarda cualquier archivo y se hará commit+push automáticamente." -ForegroundColor Cyan
Write-Host ""

# Mantener el script vivo
try {
    while ($true) { Start-Sleep -Seconds 1 }
} finally {
    $watcher.Dispose()
    $debounceTimer.Dispose()
    Write-Host "`n[Watcher] Detenido." -ForegroundColor Yellow
}
