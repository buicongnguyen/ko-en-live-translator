param(
    [int]$BackendPort = 8443,
    [string]$BackendOrigin = "https://127.0.0.1:8443"
)

$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendUrl = "https://127.0.0.1:$BackendPort/api/health"
$publicUrl = $null

function Get-TrackedNgrokProcess {
    $ngrokPidFile = Join-Path (Join-Path $ProjectRoot "logs") "ngrok.pid"
    if (-not (Test-Path -LiteralPath $ngrokPidFile)) {
        return $null
    }

    $pidValue = Get-Content -LiteralPath $ngrokPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
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

Write-Host "Live translator stack status"
Write-Host "Project: $ProjectRoot"
Write-Host ""

$listener = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    Write-Host "Backend: running on port $BackendPort (PID $($listener.OwningProcess))"
    try {
        $response = Invoke-WebRequest -Uri $backendUrl -SkipCertificateCheck -UseBasicParsing -TimeoutSec 8
        Write-Host "Backend health: $($response.StatusCode) OK"
        Write-Host "Backend auth: not required or already satisfied"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $body = $_.ErrorDetails.Message
        if ($statusCode -eq 401) {
            Write-Host "Backend health: 401 auth required (expected for protected mode)"
        } elseif ($statusCode) {
            Write-Host "Backend health: $statusCode"
            if ($body) {
                Write-Host $body
            }
        } else {
            Write-Host "Backend health check failed: $($_.Exception.Message)"
        }
    }
} else {
    Write-Host "Backend: not listening on port $BackendPort"
}

Write-Host ""

$ngrok = Get-TrackedNgrokProcess
if ($ngrok) {
    Write-Host "ngrok: tracked process running (PID $($ngrok.Id))"
} else {
    Write-Host "ngrok: no tracked process for this project"
    $untrackedNgrok = @(Get-Process -Name ngrok -ErrorAction SilentlyContinue)
    if ($untrackedNgrok.Count -gt 0) {
        Write-Host "ngrok: untracked process(es) detected and ignored: $($untrackedNgrok.Id -join ', ')"
    }
}

$tunnel = Get-ExpectedNgrokTunnel -ExpectedOrigin $BackendOrigin
if ($tunnel) {
    $publicUrl = $tunnel.public_url
    Write-Host "ngrok target: $BackendOrigin"
    Write-Host "ngrok public URL: $publicUrl"
} else {
    Write-Host "ngrok public URL for ${BackendOrigin}: not found"
}

if ($publicUrl) {
    $encodedBackend = [uri]::EscapeDataString($publicUrl)
    Write-Host ""
    Write-Host "Open app:"
    Write-Host "https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=$encodedBackend"
}
