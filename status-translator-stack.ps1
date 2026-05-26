param(
    [int]$BackendPort = 8443
)

$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendUrl = "https://127.0.0.1:$BackendPort/api/health"
$publicUrl = $null

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

$ngrok = Get-Process -Name ngrok -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ngrok) {
    Write-Host "ngrok: running (PID $($ngrok.Id))"
    try {
        $tunnels = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 8
        $publicUrl = $tunnels.tunnels |
            Where-Object { $_.proto -eq "https" } |
            Select-Object -First 1 -ExpandProperty public_url
        if ($publicUrl) {
            Write-Host "ngrok public URL: $publicUrl"
        } else {
            Write-Host "ngrok public URL: not found yet"
        }
    } catch {
        Write-Host "ngrok API check failed: $($_.Exception.Message)"
    }
} else {
    Write-Host "ngrok: not running"
}

if ($publicUrl) {
    $encodedBackend = [uri]::EscapeDataString($publicUrl)
    Write-Host ""
    Write-Host "Open app:"
    Write-Host "https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=$encodedBackend"
}
