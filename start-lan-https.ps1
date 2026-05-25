param(
    [string]$HostAddress = "0.0.0.0",
    [int]$Port = 8443,
    [string]$WhisperModel = "large-v3",
    [string]$WhisperDevice = "cuda",
    [string]$WhisperComputeType = "float16",
    [int]$WhisperBeamSize = 1
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$CertFile = Join-Path $ProjectRoot "https\translate-local.pem"
$KeyFile = Join-Path $ProjectRoot "https\translate-local-key.pem"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python virtual environment was not found at $Python. Run the setup steps first."
}

if (-not (Test-Path -LiteralPath $CertFile) -or -not (Test-Path -LiteralPath $KeyFile)) {
    throw "HTTPS certificate files were not found in $ProjectRoot\https."
}

Set-Location -LiteralPath $ProjectRoot

$env:APP_HOST = $HostAddress
$env:APP_PORT = "$Port"
$env:WHISPER_MODEL = $WhisperModel
$env:WHISPER_DEVICE = $WhisperDevice
$env:WHISPER_COMPUTE_TYPE = $WhisperComputeType
$env:WHISPER_BEAM_SIZE = "$WhisperBeamSize"
$env:SHOW_SOURCE_TEXT = "true"

Write-Host "Starting Live Korean Translator over HTTPS"
Write-Host "Project: $ProjectRoot"
Write-Host "Local URL: https://127.0.0.1:$Port"
Write-Host "LAN URL:   https://192.168.0.20:$Port"
Write-Host ""
Write-Host "Leave this PowerShell window open while testing from another laptop or phone."
Write-Host "If the browser warns about the local certificate, continue/trust it for this test server."
Write-Host ""

& $Python -m uvicorn live_translate.app:app `
    --host $HostAddress `
    --port $Port `
    --ssl-certfile $CertFile `
    --ssl-keyfile $KeyFile
