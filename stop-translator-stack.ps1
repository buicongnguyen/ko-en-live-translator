param(
    [int]$BackendPort = 8443,
    [string]$BackendOrigin = "https://127.0.0.1:8443",
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
    $stoppedTrackedNgrok = $false
    if (Test-Path -LiteralPath $NgrokPidFile) {
        $pidValue = Get-Content -LiteralPath $NgrokPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pidValue -match "^\d+$") {
            $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
            if ($process -and $process.ProcessName -eq "ngrok") {
                Stop-ByPid -ProcessId ([int]$pidValue)
                $stoppedTrackedNgrok = $true
            }
        }
    }

    if (-not $stoppedTrackedNgrok) {
        $matchingTunnel = Get-ExpectedNgrokTunnel -ExpectedOrigin $BackendOrigin
        if ($matchingTunnel) {
            Write-Warning "A tunnel for $BackendOrigin is still online, but it is not tracked by this project. It was not stopped automatically."
        }
    }
}

Remove-Item -LiteralPath $BackendPidFile, $NgrokPidFile -Force -ErrorAction SilentlyContinue
Write-Host "Translator stack stop command finished."
