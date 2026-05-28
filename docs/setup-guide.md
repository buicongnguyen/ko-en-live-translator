# Live Translator Setup Guide

Markdown companion for `setup-guide.html`.

Use this file when you want a copyable setup checklist. Use the HTML page when you want the clickable visual guide:

- Web app: <https://buicongnguyen.github.io/ko-en-live-translator/>
- Setup guide HTML: <https://buicongnguyen.github.io/ko-en-live-translator/setup-guide.html>
- Setup hub Markdown index: [setup-hub.md](setup-hub.md)
- App with current backend filled in: <https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=https%3A%2F%2Falone-catalog-rejoice.ngrok-free.dev>

## What This Project Does

This project runs live speech transcription and translation with a local GPU backend.

The public browser page runs on GitHub Pages. The AI model does not run on GitHub Pages. The model runs on a Windows PC with an NVIDIA GPU, then the browser streams microphone audio to that PC over HTTPS and WebSocket.

Main pieces:

- Frontend: static HTML, CSS, and JavaScript on GitHub Pages.
- Backend: FastAPI and WebSocket server running on the RTX PC.
- Model runtime: faster-whisper/CTranslate2 on CUDA.
- Login: Firebase Authentication with Google sign-in.
- Admin approval: approved emails stored locally on the RTX PC.
- Public tunnel: ngrok forwards a public HTTPS/WSS URL to the local backend.
- Safety controls: session limit, idle timeout, queue protection, and GPU temperature checks.

## Quick Setup Hub

Choose the part you need and follow it from top to bottom.

Separate copyable checklists:

- [Access and connect to backend](setup-access-connect.md)
- [Firebase login and admin approval](setup-firebase-admin.md)
- [ngrok public HTTPS tunnel](setup-ngrok-tunnel.md)
- [Windows RTX backend service](setup-windows-rtx-backend.md)
- [GPU and session safety](setup-gpu-safety.md)

### 1. Access: Sign In, Then Connect Backend

Use this when the RTX PC backend and ngrok are already running.

Definitions:

- Frontend: the GitHub Pages website that shows the microphone UI and transcript boxes.
- Backend origin: the HTTPS URL that points to the RTX PC, for example an ngrok URL.
- Admin approval: your admin account decides which signed-in emails can use the GPU.

Steps:

1. Open the live translator app: <https://buicongnguyen.github.io/ko-en-live-translator/>
2. Open `Connect to server`.
3. In `1 Access`, press `Sign in with Google`.
4. In `2 Backend`, paste the backend origin, for example `https://alone-catalog-rejoice.ngrok-free.dev`.
5. Press `Connect backend`.
6. If your email is approved, the app asks for microphone permission and starts listening automatically.
7. If you are admin, press `Refresh admin` to see active sessions and approve pending users.

Current test link:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=https%3A%2F%2Falone-catalog-rejoice.ngrok-free.dev
```

### 2. Firebase: Google Login And Admin Approval

Use Firebase when you want only approved email addresses to access your GPU.

Definitions:

- Firebase Auth: Google or Facebook login for the browser app. The user's password stays with Google/Firebase.
- Web config: public browser settings such as API key, auth domain, project ID, and app ID.
- Service account JSON: private backend key saved only on the RTX PC so Python can verify login tokens.

Steps:

1. Create or open the Firebase project.
2. Enable `Authentication`.
3. Enable `Google` sign-in.
4. Add the GitHub Pages domain, for example `buicongnguyen.github.io`, to Firebase authorized domains.
5. Create a Firebase Web app.
6. Add the Firebase Web app public config to GitHub Actions variables.
7. Download the Firebase Admin SDK service account JSON.
8. Save it outside the repo, for example `C:\Users\n\secrets\firebase-service-account.json`.
9. Start the protected backend with your admin email.
10. Approve other users from the web admin panel after they sign in once.

Important:

Never commit the Firebase Admin service account JSON. Only the Firebase Web app config is safe to deploy to GitHub Pages.

### 3. ngrok: Public HTTPS/WSS URL For The Home RTX PC

Use ngrok for free testing from another browser without installing Tailscale or changing router settings.

Definitions:

- Tunnel: an outbound connection from your PC to ngrok that gives the browser a public HTTPS URL.
- HTTPS/WSS: secure HTTP and secure WebSocket. The microphone page needs these for real live audio.
- Backend origin: the ngrok URL you paste into the website, without `/api/health` or `/ws`.

Steps:

1. Install or update ngrok.
2. Add your ngrok authtoken once on the RTX PC.
3. Start the protected local backend on `https://127.0.0.1:8443`.
4. Run ngrok against that local HTTPS backend.
5. Copy the forwarding URL.
6. Paste the forwarding URL into the app's `Backend origin` box.
7. Press `Connect backend`.

Commands:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok version
& $ngrok http https://127.0.0.1:8443 --host-header=rewrite
```

Example backend origin:

```text
https://alone-catalog-rejoice.ngrok-free.dev
```

### 4. Windows RTX Backend: Start, Stop, And Status

Use this on the Windows 11 Pro RTX 4080 Super host PC.

Definitions:

- FastAPI backend: the Python server that receives microphone audio and returns live translation events.
- Uvicorn: the Python web server process that runs FastAPI on port `8443`.
- Stack scripts: PowerShell helpers that start the backend, start ngrok, show status, or stop everything.

Daily commands:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1
.\status-translator-stack.ps1
```

Restart only the backend after code changes:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1 -RestartBackend
```

Restart backend and ngrok:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1 -RestartBackend -RestartNgrok
```

Stop backend and ngrok:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\stop-translator-stack.ps1
```

Check expected status:

```text
Backend: running on port 8443
Backend health: 401 auth required (expected for protected mode)
ngrok: running
ngrok public URL: https://...
```

### 5. Safety Settings: Users, Stale Audio, And GPU Heat

Use these settings before allowing more than one person to test.

Default protected backend settings:

```text
MAX_ACTIVE_SESSIONS=4
IDLE_TIMEOUT_SECONDS=300
MAX_TRANSLATION_QUEUE_SEGMENTS=2
GPU_MAX_TEMPERATURE_C=85
```

Meaning:

- `MAX_ACTIVE_SESSIONS=4`: allows four connected live translation sessions by default. This is reasonable when not everyone talks at the same time.
- `IDLE_TIMEOUT_SECONDS=300`: disconnects a browser after five minutes without microphone audio.
- `MAX_TRANSLATION_QUEUE_SEGMENTS=2`: drops older queued speech when the GPU falls behind, keeping live translation current.
- `GPU_MAX_TEMPERATURE_C=85`: blocks new sessions if `nvidia-smi` reports the GPU at or above 85C.

To test eight mostly idle users later:

```powershell
.\start-translator-stack.ps1 -RestartBackend -MaxActiveSessions 8
```

Use the admin panel to watch queue size, dropped segments, and GPU temperature. If several users talk at once and latency rises, lower the cap back to `4`.

Watch GPU status:

```powershell
nvidia-smi
```

Temperature guidance:

- Below 75C is comfortable.
- 75C to 84C is usable but worth watching.
- 85C or higher means pause new sessions, improve airflow, or lower load.

## Definitions First

Read these terms before debugging setup problems.

| Term | Meaning | Example |
| --- | --- | --- |
| Host PC / AI server | Windows PC that runs Python, FastAPI, and the Whisper model on the GPU. | RTX 4080 Super PC at `192.168.0.20`. |
| Client device | Browser device that opens the website and sends microphone audio. | Phone, laptop, tablet, or host PC browser. |
| Backend | Python service that receives audio and returns transcript/translation events. | `/api/health` and `/ws`. |
| Frontend / web app | HTML, CSS, and JavaScript page the user sees. | Page with source text, English translation, and `Start mic`. |
| LAN | Your local Wi-Fi/router network. | Phone and PC on the same Wi-Fi. |
| HTTPS / WSS | Secure web page and secure WebSocket. | Required for smartphone or second-laptop microphone access. |
| Caddy / reverse proxy | HTTPS server that forwards browser traffic to FastAPI. | `https://192.168.0.20:8443` to `http://127.0.0.1:8000`. |
| Whisper model | Local speech model that transcribes Korean and translates to English. | `medium` for laptop tests, `large-v3` for the RTX server. |
| VAD | Voice activity detection. | Prevents silence from becoming fake translation text. |
| NPU | Neural processing unit for supported AI workloads. | Useful on phone only when model/runtime support it. |

## Recommended Deployment Order

Use this order when the RTX PC hosts the backend and a smartphone or laptop uses its microphone.

### 1. Run Locally On The Host PC First

This confirms Python, CUDA, the model, and microphone capture work before adding network complexity.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Open:

```text
http://127.0.0.1:8000
```

### 2. Bind The Backend To The LAN

Restart FastAPI on `0.0.0.0` so other devices can reach it.

```powershell
$env:APP_HOST="0.0.0.0"
$env:APP_PORT="8000"
$env:WHISPER_MODEL="large-v3"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="float16"
python main.py
```

### 3. Open Firewall Ports

Run from Administrator PowerShell on the host PC.

```powershell
New-NetFirewallRule -DisplayName "Live Translator 8000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -Profile Private
New-NetFirewallRule -DisplayName "Live Translator HTTPS 8443" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -Profile Private
```

### 4. Add HTTPS For Phone And Laptop Microphones

Browsers usually block microphone access on plain LAN HTTP. Use HTTPS.

Example Caddy-style idea:

```text
https://192.168.0.20:8443 {
  tls ./translate-local.pem ./translate-local-key.pem
  reverse_proxy 127.0.0.1:8000
}
```

### 5. Open From Smartphone Or Laptop

Steps:

1. Put the phone or laptop on the same Wi-Fi.
2. Open `https://192.168.0.20:8443`.
3. Accept or trust the certificate if needed.
4. Press `Start mic`.
5. Allow microphone permission.
6. Speak Korean.
7. Confirm Korean transcript and English translation appear.

## Public GitHub Pages Login With RTX Backend

GitHub Pages can be the public website, login screen, and microphone UI.

GitHub Pages cannot run the GPU model and cannot forward live GPU traffic by itself. The browser connects from `github.io` to a separate HTTPS/WSS backend URL that reaches the RTX PC.

Public flow:

```text
GitHub Pages UI
-> Firebase Google/Facebook login
-> Approved email check
-> ngrok or DuckDNS backend URL
-> RTX 4080 Super WebSocket backend
```

Important pieces:

| Piece | Where it lives | Secret? |
| --- | --- | --- |
| Firebase web config | Generated into the GitHub Pages site during deployment. | No private key, but restrict authorized domains. |
| Firebase Admin service account | RTX PC only, for example `C:\Users\n\secrets\firebase-service-account.json`. | Yes. Never commit it. |
| Admin email | `ADMIN_EMAILS` environment variable on the RTX PC. | Keep it out of public docs if desired. |
| User approvals | Local SQLite database `data/auth-users.sqlite3` on the RTX PC. | Local-only state, ignored by Git. |
| Backend public URL | ngrok first, DuckDNS + Caddy later. | Shareable, but backend still requires approved login. |

## Choose Between Two App Shapes

### Option A: LAN GPU Server + Web App

Best quality.

The RTX 4080 Super or RTX 5090 PC runs FastAPI and the AI model. Laptops, phones, or tablets open the web app and stream microphone audio to the server.

Use this when you want the best Korean recognition and a larger model such as `large-v3`.

### Option B: Local PC + Browser Interface

Simpler small app.

The laptop runs the backend and model locally. The browser UI opens at `http://127.0.0.1:8000`, captures the microphone, and shows subtitles without another server.

Use this first when you are still proving the app works.

## Minimum And Recommended Setup

| Case | Minimum | Recommended |
| --- | --- | --- |
| Local laptop test | NVIDIA A1000-class GPU or CPU fallback | A1000 8 GB with `small` or `medium` |
| RTX server | CUDA-capable NVIDIA GPU | RTX 4080 Super with `large-v3` |
| Browser client | Chrome or Edge | Chrome/Edge over HTTPS |
| Phone client | Same Wi-Fi or public HTTPS URL | Galaxy S25 as browser client to RTX backend |
| Public access | ngrok free tunnel | ngrok for testing, DuckDNS + Caddy for stable home setup |
| Login | Firebase Auth | Firebase Auth with admin approval |

## Install Resources

Core installs:

- Python for Windows: <https://www.python.org/downloads/windows/>
- Git for Windows: <https://git-scm.com/download/win>
- NVIDIA drivers: <https://www.nvidia.com/Download/index.aspx>
- CUDA for Windows: <https://docs.nvidia.com/cuda/cuda-installation-guide-microsoft-windows/index.html>
- cuDNN for Windows: <https://docs.nvidia.com/deeplearning/cudnn/backend/latest/installation/windows.html>
- FFmpeg: <https://www.ffmpeg.org/download.html>

Project runtime:

- FastAPI: <https://fastapi.tiangolo.com/>
- Uvicorn: <https://www.uvicorn.org/settings/>
- faster-whisper: <https://github.com/SYSTRAN/faster-whisper>
- CTranslate2: <https://github.com/OpenNMT/CTranslate2>
- webrtcvad-wheels: <https://pypi.org/project/webrtcvad-wheels/>

Public access and auth:

- Firebase Authentication: <https://firebase.google.com/docs/auth/>
- ngrok WebSockets: <https://ngrok.com/docs/using-ngrok-with/websockets/>
- DuckDNS: <https://www.duckdns.org/>
- Caddy HTTPS: <https://caddyserver.com/docs/automatic-https>
- GitHub Pages: <https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages>

## Model Settings

Recommended RTX 4080 Super server preset:

```powershell
$env:WHISPER_MODEL="large-v3"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="float16"
$env:WHISPER_BEAM_SIZE="1"
$env:SHOW_SOURCE_TEXT="true"
```

Recommended A1000 laptop safe preset:

```powershell
$env:WHISPER_MODEL="small"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="int8_float16"
$env:WHISPER_BEAM_SIZE="1"
```

Quality upgrade for A1000 after stable testing:

```powershell
$env:WHISPER_MODEL="medium"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="int8_float16"
$env:WHISPER_BEAM_SIZE="1"
```

CPU fallback:

```powershell
$env:WHISPER_MODEL="base"
$env:WHISPER_DEVICE="cpu"
$env:WHISPER_COMPUTE_TYPE="int8"
```

Noise and hallucination filters:

```powershell
$env:MIN_AUDIO_RMS="0.0035"
$env:NO_SPEECH_THRESHOLD="0.55"
$env:LOG_PROB_THRESHOLD="-1.0"
$env:COMPRESSION_RATIO_THRESHOLD="2.4"
```

If silence creates fake text such as `Thanks for watching`, try:

```powershell
$env:MIN_AUDIO_RMS="0.005"
$env:NO_SPEECH_THRESHOLD="0.45"
$env:END_SILENCE_MS="900"
$env:MIN_SPEECH_MS="650"
```

## Better Model Options To Research

Current practical baseline:

- faster-whisper with `large-v3` on RTX 4080 Super.
- faster-whisper with `small` or `medium` on A1000.
- Whisper direct `task=translate` for Korean speech to English text.

Modern research options:

- SimulStreaming: lower-latency streaming ASR research path.
- Whisper-Streaming: streaming wrapper around Whisper-style models.
- SeamlessM4T v2: speech translation research path, heavier to host.
- Voxtral Mini Realtime: realtime speech model path to evaluate.
- Qwen3-ASR: ASR model family to evaluate for Korean recognition.
- OPUS-MT or NLLB: text translation after Korean transcription.
- NVIDIA Parakeet: ASR research path, not necessarily direct Korean-to-English translation.

Recommended next model experiment:

1. Keep `large-v3` as baseline on the RTX server.
2. Test Korean transcription quality first.
3. Add a Korean-to-English text translation model only if direct Whisper translation is not good enough.
4. Compare latency and accuracy with the same Korean sample.

## Galaxy S25 Path

Recommended first use:

Use the S25 as a browser client while the RTX PC runs the model.

Why:

- The RTX PC can run a larger model.
- The S25 browser can capture microphone audio.
- The phone does not need to run the full AI model locally.

Experimental native app path:

- Kotlin Android app.
- Android microphone APIs.
- Android SpeechRecognizer or Whisper Tiny/Base via TFLite/LiteRT.
- ML Kit Translation for Korean-to-English text.
- NPU/GPU acceleration only after the model and runtime support it.

Recommendation:

Keep the RTX server path as the quality baseline before investing in native phone inference.

## A1000 Laptop Path

Use this for a weaker local GPU.

Steps:

1. Check NVIDIA driver and CUDA visibility.
2. Start with `small`.
3. Use `int8_float16`.
4. Keep beam size at `1`.
5. Move to `medium` only after stable testing.
6. Fall back to CPU `base` if CUDA is unavailable.

CUDA check:

```powershell
python -c "import ctranslate2; print(ctranslate2.get_cuda_device_count())"
```

## RTX 4080 Super LAN Guide

Goal:

The RTX 4080 Super PC hosts the backend. Another laptop opens the website and uses its own microphone.

Core steps:

1. Prepare the RTX 4080 Super server.
2. Install Python dependencies.
3. Start the backend on `0.0.0.0`.
4. Open firewall ports.
5. Add HTTPS for browser microphone permission.
6. Open the website from the other laptop.
7. Choose Korean source and English target.
8. Press `Start mic`.

Useful local URLs:

```text
https://127.0.0.1:8443
https://192.168.0.20:8443
https://192.168.0.20:8443/api/health
```

## Local Laptop Setup

Use this when the same laptop runs the model and browser UI.

Install:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Start:

```powershell
python main.py
```

Open:

```text
http://127.0.0.1:8000
```

Localhost is a browser secure context, so microphone access should work without HTTPS on the same machine.

## Audio Capture

Microphone mode:

- Works from the browser.
- Best for in-person translation.
- Best first MVP.

System audio mode:

- Useful for Zoom, Teams, YouTube, or browser audio.
- Needs a Windows desktop helper.
- On Windows, research WASAPI loopback capture.
- The helper can stream PCM audio to the same backend.

Recommendation:

Build browser microphone mode first, then add a Windows helper later.

## Test Checklist

Use this checklist before comparing the app against Transync AI or another commercial translator.

- Audio: microphone permission opens, waveform level changes, and silence does not trigger translation.
- Noise hallucination: leave the room quiet for 20 seconds and confirm the transcript does not repeat phrases like `Thanks for watching` or `subscribe`.
- Latency: normal Korean speech produces English within about 1.5 to 3 seconds on laptop mode.
- Accuracy: compare `small`, `medium`, and server `large-v3` with the same Korean sample.
- Network: another device can open the HTTPS web app and connect to the WebSocket without mixed-content errors.
- Recovery: unplugging the mic or losing the server connection shows a readable error and can reconnect.
- Thermals: run for 15 minutes and watch GPU memory, fan noise, temperature, and whether latency drifts upward.
- Admin: pending users appear in the admin panel and approved users can reconnect.
- Session cap: a fifth active user receives a busy message when `MAX_ACTIVE_SESSIONS=4`.

## Useful Project Docs

- Public auth plan: `docs/public-auth-deployment.md`
- ngrok and Firebase testing runbook: `docs/ngrok-firebase-testing.md`
- Windows RTX deployment notes: `docs/windows-rtx4080-deployment.md`
- Windows service management: `docs/windows-service-management.md`
- Galaxy S25 native plan: `docs/galaxy-s25-native.md`

## Recommended Build Order

1. Local laptop microphone subtitles.
2. RTX 4080 Super backend on the host PC.
3. GitHub Pages frontend with Firebase login.
4. ngrok public HTTPS/WSS test tunnel.
5. Admin approval and session safety.
6. LAN and phone browser testing.
7. Optional Windows system-audio helper.
8. Optional native Android experiment.
