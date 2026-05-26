param(
    [string]$FirebaseProjectId = "livetranslateai-local",
    [string]$AdminEmails = "nguyenbuicong80@gmail.com",
    [string]$FirebaseCredentialsFile = "$env:USERPROFILE\secrets\firebase-service-account.json",
    [string]$BackendOrigin = "https://127.0.0.1:8443",
    [int]$BackendPort = 8443,
    [int]$MaxActiveSessions = 2,
    [int]$IdleTimeoutSeconds = 300,
    [int]$MaxTranslationQueueSegments = 2,
    [int]$GpuMaxTemperatureC = 85,
    [switch]$RestartBackend,
    [switch]$RestartNgrok
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$CertFile = Join-Path $ProjectRoot "https\translate-local.pem"
$KeyFile = Join-Path $ProjectRoot "https\translate-local-key.pem"
$LogsDir = Join-Path $ProjectRoot "logs"
$BackendPidFile = Join-Path $LogsDir "backend.pid"
$NgrokPidFile = Join-Path $LogsDir "ngrok.pid"
$NgrokExe = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\ngrok.exe"
$DatabasePath = Join-Path $ProjectRoot "data\auth-users.sqlite3"

function Get-BackendListener {
    Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Stop-ProcessIfRunning {
    param([int]$ProcessId)

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $ProcessId -Force
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python virtual environment was not found at $Python."
}

if (-not (Test-Path -LiteralPath $FirebaseCredentialsFile)) {
    throw "Firebase Admin service account JSON was not found at $FirebaseCredentialsFile."
}

if (-not (Test-Path -LiteralPath $NgrokExe)) {
    throw "ngrok was not found at $NgrokExe."
}

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DatabasePath) | Out-Null

$listener = Get-BackendListener
if ($listener -and $RestartBackend) {
    Stop-ProcessIfRunning -ProcessId $listener.OwningProcess
    Start-Sleep -Seconds 2
    $listener = Get-BackendListener
}

if (-not $listener) {
    $env:APP_HOST = "0.0.0.0"
    $env:APP_PORT = "$BackendPort"
    $env:WHISPER_MODEL = "large-v3"
    $env:WHISPER_DEVICE = "cuda"
    $env:WHISPER_COMPUTE_TYPE = "float16"
    $env:WHISPER_BEAM_SIZE = "1"
    $env:SHOW_SOURCE_TEXT = "true"
    $env:MAX_ACTIVE_SESSIONS = "$MaxActiveSessions"
    $env:IDLE_TIMEOUT_SECONDS = "$IdleTimeoutSeconds"
    $env:MAX_TRANSLATION_QUEUE_SEGMENTS = "$MaxTranslationQueueSegments"
    $env:GPU_STATUS_ENABLED = "true"
    $env:GPU_MAX_TEMPERATURE_C = "$GpuMaxTemperatureC"
    $env:AUTH_REQUIRED = "true"
    $env:AUTH_PROVIDER = "firebase"
    $env:FIREBASE_PROJECT_ID = $FirebaseProjectId
    $env:FIREBASE_CREDENTIALS_FILE = $FirebaseCredentialsFile
    $env:ADMIN_EMAILS = $AdminEmails
    $env:APPROVED_EMAILS = ""
    $env:AUTH_DATABASE_PATH = $DatabasePath
    $env:CORS_ALLOW_ORIGINS = "https://buicongnguyen.github.io"

    $backendArgs = @(
        "-m", "uvicorn", "live_translate.app:app",
        "--host", "0.0.0.0",
        "--port", "$BackendPort",
        "--ssl-certfile", $CertFile,
        "--ssl-keyfile", $KeyFile
    )

    $backend = Start-Process `
        -FilePath $Python `
        -ArgumentList $backendArgs `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput (Join-Path $LogsDir "backend.out.log") `
        -RedirectStandardError (Join-Path $LogsDir "backend.err.log") `
        -PassThru `
        -WindowStyle Hidden

    Set-Content -LiteralPath $BackendPidFile -Value $backend.Id
    Start-Sleep -Seconds 5
    $listener = Get-BackendListener
}

if (-not $listener) {
    throw "Backend did not start on port $BackendPort. Check logs\backend.err.log."
}

$ngrokProcesses = @(Get-Process -Name ngrok -ErrorAction SilentlyContinue)
if ($ngrokProcesses.Count -gt 0 -and $RestartNgrok) {
    $ngrokProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
    $ngrokProcesses = @()
}

if ($ngrokProcesses.Count -eq 0) {
    $ngrok = Start-Process `
        -FilePath $NgrokExe `
        -ArgumentList @("http", $BackendOrigin, "--host-header=rewrite", "--log", "stdout") `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput (Join-Path $LogsDir "ngrok.out.log") `
        -RedirectStandardError (Join-Path $LogsDir "ngrok.err.log") `
        -PassThru `
        -WindowStyle Hidden

    Set-Content -LiteralPath $NgrokPidFile -Value $ngrok.Id
    Start-Sleep -Seconds 5
}

& (Join-Path $ProjectRoot "status-translator-stack.ps1")
