# Windows RTX 4080 Super Deployment Notes

This document records the deployment process for running the Korean-to-English live translator on a Windows 11 Pro host PC with an NVIDIA RTX 4080 SUPER. The goal is to run the model on this PC and let another laptop open the web app over the local network.

## Current Host Status

Checked on May 24, 2026.

| Item | Value |
| --- | --- |
| OS | Windows 11 Pro 64-bit |
| PowerShell | User reported 7.6.2; Codex shell observed 7.5.5. Commands are compatible with both. |
| GPU | NVIDIA GeForce RTX 4080 SUPER |
| GPU memory | 16,376 MiB |
| NVIDIA driver | 591.86 |
| Host LAN IP | `192.168.0.20` |
| Network profile | Private |
| Python used by repo venv | Python 3.13.5 |
| CUDA check | `ctranslate2.get_cuda_device_count()` returned `1` |
| CUDA DLLs found | `cublas64_12.dll`, `cudnn64_9.dll` |
| Deployed model | `large-v3` |
| Runtime | CUDA `float16`, `beam_size=1`, Korean transcript enabled |

## Deployment Status From This Run

The FastAPI backend was started successfully and is currently listening on:

```text
http://0.0.0.0:8000
```

Health checks passed from this host:

```text
http://127.0.0.1:8000/api/health
http://192.168.0.20:8000/api/health
```

The health endpoint reported:

```json
{
  "app": "ko-en-live-translator",
  "status": "ok",
  "runtime": {
    "model": "large-v3",
    "source_language": "ko",
    "device": "cuda",
    "compute_type": "float16",
    "ready": true,
    "show_source_text": true
  }
}
```

The local web UI was also verified at:

```text
http://127.0.0.1:8000/
```

The page loaded with the expected paired subtitle layout:

```text
Korean transcript + English translation
Start Listening
```

## Start The Server

Open PowerShell in the project folder:

```powershell
Set-Location C:\Users\n\source\repos\rambo_game\Transcribe_translate
```

Run the RTX 4080 SUPER preset:

```powershell
.venv\Scripts\Activate.ps1

$env:APP_HOST="0.0.0.0"
$env:APP_PORT="8000"
$env:WHISPER_MODEL="large-v3"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="float16"
$env:WHISPER_BEAM_SIZE="1"
$env:SHOW_SOURCE_TEXT="true"

python main.py
```

For a background run with logs:

```powershell
Set-Location C:\Users\n\source\repos\rambo_game\Transcribe_translate
New-Item -ItemType Directory -Force -Path logs | Out-Null

$env:APP_HOST="0.0.0.0"
$env:APP_PORT="8000"
$env:WHISPER_MODEL="large-v3"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="float16"
$env:WHISPER_BEAM_SIZE="1"
$env:SHOW_SOURCE_TEXT="true"

Start-Process `
  -FilePath ".venv\Scripts\python.exe" `
  -ArgumentList "main.py" `
  -WorkingDirectory "C:\Users\n\source\repos\rambo_game\Transcribe_translate" `
  -RedirectStandardOutput "logs\server.out.log" `
  -RedirectStandardError "logs\server.err.log" `
  -WindowStyle Hidden
```

## Verify On The Host PC

Check the server port:

```powershell
Get-NetTCPConnection -LocalPort 8000
```

Check the app health:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8000/api/health -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Check the LAN health URL from the host:

```powershell
Invoke-WebRequest -Uri http://192.168.0.20:8000/api/health -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Open this on the host PC:

```text
http://127.0.0.1:8000/
```

Click `Start Listening`. Browsers allow microphone access on `localhost`, so this is the best first real microphone test.

## Test From Another Laptop

First check if the laptop can see the host web server:

```text
http://192.168.0.20:8000/
http://192.168.0.20:8000/api/health
```

Important: the page may load over plain HTTP, but microphone capture from another laptop usually will not work over plain LAN HTTP. Browser microphone APIs require a secure context. `localhost` is allowed, but `http://192.168.0.20:8000` is normally not.

For the second laptop test:

1. Confirm the page loads over HTTP.
2. If it does not load, add the firewall rule below.
3. For real microphone access from the laptop, configure HTTPS with a trusted local certificate.

## Firewall Rule

The firewall rule requires an Administrator PowerShell window. The non-admin Codex shell tried this and received `Access is denied`.

Run this from PowerShell as Administrator:

```powershell
New-NetFirewallRule `
  -DisplayName "KO EN Live Translator 8000" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8000 `
  -Profile Private
```

Verify it:

```powershell
Get-NetFirewallRule -DisplayName "KO EN Live Translator 8000"
```

Then retry from the other laptop:

```text
http://192.168.0.20:8000/api/health
```

## HTTPS Plan For Laptop Microphone Access

For a browser on another laptop to use its microphone, use HTTPS. The recommended local-network setup is:

```text
Laptop browser microphone
  -> https://192.168.0.20:8443
  -> Caddy reverse proxy on host PC
  -> http://127.0.0.1:8000 FastAPI backend
  -> RTX 4080 SUPER Whisper large-v3
```

Install tools:

```powershell
winget install FiloSottile.mkcert
winget install CaddyServer.Caddy
```

Create a certificate on the host:

```powershell
mkcert -install
mkcert 192.168.0.20 localhost 127.0.0.1
```

Example `Caddyfile`:

```caddyfile
https://192.168.0.20:8443 {
  tls ./192.168.0.20+2.pem ./192.168.0.20+2-key.pem
  reverse_proxy 127.0.0.1:8000
}
```

Start Caddy from the folder containing the `Caddyfile` and certificate files:

```powershell
caddy run --config Caddyfile
```

Open the HTTPS page from the laptop:

```text
https://192.168.0.20:8443/
```

If the laptop does not trust the certificate, install the mkcert root CA on the laptop. On the host, find the CA folder with:

```powershell
mkcert -CAROOT
```

Copy `rootCA.pem` to the laptop and import it into the laptop's Trusted Root Certification Authorities store.

## Stop The Server

Find the process listening on port `8000`:

```powershell
Get-NetTCPConnection -LocalPort 8000 | Select-Object LocalAddress,LocalPort,State,OwningProcess
```

Stop the owning process:

```powershell
Stop-Process -Id <OwningProcess>
```

Or stop all Python processes running this app:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
  Where-Object { $_.CommandLine -like "*Transcribe_translate*main.py*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId }
```

## Troubleshooting

If `ready` is `false`, wait for the first model load. The first `large-v3` launch may download model files.

If Hugging Face downloads are slow or rate-limited, set `HF_TOKEN` before starting the server.

If another laptop cannot open the page, check:

```powershell
Get-NetConnectionProfile
Get-NetFirewallRule -DisplayName "KO EN Live Translator 8000"
Test-NetConnection -ComputerName 192.168.0.20 -Port 8000
```

If the page loads but the microphone does not work on the laptop, switch from HTTP to HTTPS as described above.

If pressing `Start Listening` shows this error:

```text
Microphone could not start: Cannot read properties of undefined (reading 'getUserMedia')
```

the browser did not expose the microphone API for that page. The most common cause is opening the host PC from another laptop with plain LAN HTTP:

```text
http://192.168.0.20:8000
```

Use one of these instead:

```text
http://127.0.0.1:8000
```

on the host PC, or:

```text
https://192.168.0.20:8443
```

from another laptop after setting up HTTPS with Caddy and mkcert.

If GPU memory becomes too high, use a lighter preset:

```powershell
$env:WHISPER_MODEL="medium"
$env:WHISPER_COMPUTE_TYPE="int8_float16"
$env:WHISPER_BEAM_SIZE="1"
$env:SHOW_SOURCE_TEXT="true"
python main.py
```
