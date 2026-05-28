param(
    [Parameter(Mandatory = $true)]
    [string]$FirebaseProjectId,

    [Parameter(Mandatory = $true)]
    [string]$AdminEmails,

    [string]$FirebaseCredentialsFile = "$env:USERPROFILE\secrets\firebase-service-account.json",
    [string]$ApprovedEmails = "",
    [string]$CorsAllowOrigins = "https://buicongnguyen.github.io",
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8443,
    [string]$WhisperModel = "large-v3",
    [string]$WhisperDevice = "cuda",
    [string]$WhisperComputeType = "float16",
    [int]$WhisperBeamSize = 1,
    [int]$MaxActiveSessions = 4,
    [int]$IdleTimeoutSeconds = 300,
    [int]$MaxTranslationQueueSegments = 2,
    [int]$GpuMaxTemperatureC = 85
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$CertFile = Join-Path $ProjectRoot "https\translate-local.pem"
$KeyFile = Join-Path $ProjectRoot "https\translate-local-key.pem"
$DatabasePath = Join-Path $ProjectRoot "data\auth-users.sqlite3"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python virtual environment was not found at $Python. Run the setup steps first."
}

if (-not (Test-Path -LiteralPath $CertFile) -or -not (Test-Path -LiteralPath $KeyFile)) {
    throw "HTTPS certificate files were not found in $ProjectRoot\https."
}

if (-not (Test-Path -LiteralPath $FirebaseCredentialsFile)) {
    throw "Firebase Admin service account JSON was not found at $FirebaseCredentialsFile. Download it from Firebase and keep it outside the repo."
}

if ($FirebaseProjectId -match "PASTE|your-" -or $AdminEmails -match "PASTE|your-" -or -not $AdminEmails.Contains("@")) {
    throw "Replace FirebaseProjectId and AdminEmails with real values before starting protected mode."
}

Set-Location -LiteralPath $ProjectRoot
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $DatabasePath) | Out-Null

$env:APP_HOST = $HostAddress
$env:APP_PORT = "$Port"
$env:WHISPER_MODEL = $WhisperModel
$env:WHISPER_DEVICE = $WhisperDevice
$env:WHISPER_COMPUTE_TYPE = $WhisperComputeType
$env:WHISPER_BEAM_SIZE = "$WhisperBeamSize"
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
$env:APPROVED_EMAILS = $ApprovedEmails
$env:AUTH_DATABASE_PATH = $DatabasePath
$env:CORS_ALLOW_ORIGINS = $CorsAllowOrigins

Write-Host "Starting protected Live Speech Translator over HTTPS"
Write-Host "Project:       $ProjectRoot"
Write-Host "Local URL:     https://127.0.0.1:$Port"
Write-Host "LAN URL:       https://192.168.0.20:$Port"
Write-Host "Admin emails:  $AdminEmails"
Write-Host "User DB:       $DatabasePath"
Write-Host "Session cap:   $MaxActiveSessions active sessions"
Write-Host "Idle timeout:  $IdleTimeoutSeconds seconds without microphone audio"
Write-Host "GPU limit:     $GpuMaxTemperatureC C"
Write-Host ""
Write-Host "Leave this PowerShell window open while testing."
Write-Host "Use ngrok in another PowerShell window to expose this HTTPS backend."
Write-Host ""

& $Python -m uvicorn live_translate.app:app `
    --host $HostAddress `
    --port $Port `
    --ssl-certfile $CertFile `
    --ssl-keyfile $KeyFile
