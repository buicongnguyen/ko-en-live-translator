param(
    [string]$FirebaseProjectId = $env:FIREBASE_PROJECT_ID,
    [string]$AdminEmails = $env:ADMIN_EMAILS,
    [string]$FirebaseCredentialsFile = "$env:USERPROFILE\secrets\firebase-service-account.json",
    [string]$BackendOrigin = "https://127.0.0.1:8443",
    [int]$BackendPort = 8443,
    [int]$MaxActiveSessions = 4,
    [int]$IdleTimeoutSeconds = 300,
    [int]$MaxTranslationQueueSegments = 2,
    [int]$GpuMaxTemperatureC = 85,
    [string]$ConfigFile = "",
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
$DefaultConfigFile = Join-Path $ProjectRoot "translator-stack.local.psd1"

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

function Import-LocalConfig {
    if (-not $ConfigFile -and (Test-Path -LiteralPath $DefaultConfigFile)) {
        $script:ConfigFile = $DefaultConfigFile
    }

    if (-not $ConfigFile) {
        return
    }

    if (-not (Test-Path -LiteralPath $ConfigFile)) {
        throw "Config file was not found at $ConfigFile."
    }

    $config = Import-PowerShellDataFile -LiteralPath $ConfigFile
    if (-not $FirebaseProjectId -and $config.FirebaseProjectId) {
        $script:FirebaseProjectId = [string]$config.FirebaseProjectId
    }
    if (-not $AdminEmails -and $config.AdminEmails) {
        $script:AdminEmails = [string]$config.AdminEmails
    }
    if ($FirebaseCredentialsFile -eq "$env:USERPROFILE\secrets\firebase-service-account.json" -and $config.FirebaseCredentialsFile) {
        $script:FirebaseCredentialsFile = [string]$config.FirebaseCredentialsFile
    }
    if ($BackendOrigin -eq "https://127.0.0.1:8443" -and $config.BackendOrigin) {
        $script:BackendOrigin = [string]$config.BackendOrigin
    }
}

function Test-PlaceholderValue {
    param([string]$Value)

    return -not $Value -or $Value -match "your-|PASTE|example"
}

function Get-TrackedNgrokProcess {
    if (-not (Test-Path -LiteralPath $NgrokPidFile)) {
        return $null
    }

    $pidValue = Get-Content -LiteralPath $NgrokPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue -notmatch "^\d+$") {
        return $null
    }

    $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "ngrok") {
        return $process
    }

    return $null
}

function Get-ExpectedNgrokTunnel {
    param([string]$ExpectedOrigin)

    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 8
        $expected = $ExpectedOrigin.TrimEnd("/")
        return $tunnels.tunnels |
            Where-Object {
                $_.proto -eq "https" -and
                [string]$_.config.addr -and
                ([string]$_.config.addr).TrimEnd("/") -eq $expected
            } |
            Select-Object -First 1
    } catch {
        return $null
    }
}

function Get-NgrokApiProcess {
    $listener = Get-NetTCPConnection -LocalPort 4040 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) {
        return $null
    }

    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "ngrok") {
        return $process
    }

    return $null
}

Import-LocalConfig

if ((Test-PlaceholderValue $FirebaseProjectId) -or (Test-PlaceholderValue $AdminEmails) -or $AdminEmails -notmatch "@") {
    throw (
        "FirebaseProjectId and AdminEmails must be configured. " +
        "Pass -FirebaseProjectId/-AdminEmails or copy translator-stack.local.example.psd1 " +
        "to translator-stack.local.psd1 and fill in local values."
    )
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

$trackedNgrok = Get-TrackedNgrokProcess
if ($trackedNgrok -and $RestartNgrok) {
    Stop-ProcessIfRunning -ProcessId $trackedNgrok.Id
    Remove-Item -LiteralPath $NgrokPidFile -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $trackedNgrok = $null
}

if ($trackedNgrok) {
    $expectedTunnel = Get-ExpectedNgrokTunnel -ExpectedOrigin $BackendOrigin
    if (-not $expectedTunnel) {
        throw (
            "Tracked ngrok process $($trackedNgrok.Id) is running, but no tunnel for $BackendOrigin was found. " +
            "Run with -RestartNgrok to recreate this project's tunnel."
        )
    }
    Write-Host "Reusing tracked ngrok tunnel (PID $($trackedNgrok.Id)) for $BackendOrigin."
} else {
    $untrackedNgrok = @(Get-Process -Name ngrok -ErrorAction SilentlyContinue)
    $existingExpectedTunnel = Get-ExpectedNgrokTunnel -ExpectedOrigin $BackendOrigin
    $ngrokApiProcess = Get-NgrokApiProcess
    if ($existingExpectedTunnel -and $ngrokApiProcess -and -not $RestartNgrok) {
        Set-Content -LiteralPath $NgrokPidFile -Value $ngrokApiProcess.Id
        Write-Host "Adopted existing ngrok tunnel (PID $($ngrokApiProcess.Id)) for $BackendOrigin."
    } else {
        if ($untrackedNgrok.Count -gt 0) {
            Write-Warning "Found untracked ngrok process(es); leaving unrelated tunnels alone and starting this project's tunnel separately."
        }

        if ($existingExpectedTunnel -and $ngrokApiProcess -and $RestartNgrok) {
            Stop-ProcessIfRunning -ProcessId $ngrokApiProcess.Id
            Start-Sleep -Seconds 2
        }

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

        $ngrokProcess = Get-Process -Id $ngrok.Id -ErrorAction SilentlyContinue
        $expectedTunnel = Get-ExpectedNgrokTunnel -ExpectedOrigin $BackendOrigin
        if (-not $ngrokProcess -or -not $expectedTunnel) {
            $ngrokErrorLog = Join-Path $LogsDir "ngrok.err.log"
            $ngrokError = ""
            if (Test-Path -LiteralPath $ngrokErrorLog) {
                $ngrokError = (Get-Content -LiteralPath $ngrokErrorLog -Tail 8 -ErrorAction SilentlyContinue) -join " "
            }

            throw (
                "ngrok did not create a tunnel for $BackendOrigin. " +
                "If another ngrok endpoint is already online, stop that endpoint or run this script again with -RestartNgrok. " +
                "ngrok error: $ngrokError"
            )
        }
    }
}

& (Join-Path $ProjectRoot "status-translator-stack.ps1") -BackendPort $BackendPort -BackendOrigin $BackendOrigin
