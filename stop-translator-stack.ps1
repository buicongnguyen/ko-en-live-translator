param(
    [int]$BackendPort = 8443,
    [switch]$KeepNgrok
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $ProjectRoot "logs"
$BackendPidFile = Join-Path $LogsDir "backend.pid"
$NgrokPidFile = Join-Path $LogsDir "ngrok.pid"

function Stop-ByPid {
    param([int]$ProcessId)

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $ProcessId -Force
        Write-Host "Stopped process $ProcessId."
    }
}

if (Test-Path -LiteralPath $BackendPidFile) {
    $pidValue = Get-Content -LiteralPath $BackendPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue -match "^\d+$") {
        Stop-ByPid -ProcessId ([int]$pidValue)
    }
}

$listeners = @(Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($processInfo.CommandLine -like "*Transcribe_translate*" -and $processInfo.CommandLine -like "*uvicorn*") {
        Stop-ByPid -ProcessId $listener.OwningProcess
    }
}

if (-not $KeepNgrok) {
    if (Test-Path -LiteralPath $NgrokPidFile) {
        $pidValue = Get-Content -LiteralPath $NgrokPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pidValue -match "^\d+$") {
            Stop-ByPid -ProcessId ([int]$pidValue)
        }
    }

    Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
}

Remove-Item -LiteralPath $BackendPidFile, $NgrokPidFile -Force -ErrorAction SilentlyContinue
Write-Host "Translator stack stop command finished."
