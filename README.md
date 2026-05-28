# Live Speech Translator

This project is a local web app for near-real-time speech translation on a GPU-equipped PC or laptop. Choose a source language and a target language, then view the source transcript beside the translated text in compact scrollable text boxes.

## Definitions

- **Host PC / AI server:** the Windows PC that runs Python, FastAPI, and the Whisper model on the GPU.
- **Client device:** the phone, laptop, tablet, or browser that opens the website and sends microphone audio.
- **Backend:** the Python service with `/api/health` and `/ws`; it receives audio and returns transcript/translation events.
- **Frontend / web app:** the HTML, CSS, and JavaScript page with `Start mic`, source transcript, and translated text.
- **LAN:** your local Wi-Fi/router network, for example a PC at `192.168.0.20` and a phone on the same Wi-Fi.
- **HTTPS / WSS:** secure web page and secure WebSocket. Phone and second-laptop microphones usually require this.
- **Reverse proxy:** Caddy or another small web server that exposes HTTPS and forwards traffic to FastAPI.
- **VAD:** voice activity detection. It decides when a speech sentence starts and ends.

## GitHub Pages frontend

There is now a static frontend in [docs/index.html](docs/index.html) that is ready to publish with GitHub Pages.
The setup guide for the two app shapes is in [docs/setup-guide.html](docs/setup-guide.html).
The Windows RTX 4080 Super deployment runbook is in [docs/windows-rtx4080-deployment.md](docs/windows-rtx4080-deployment.md).
The Windows startup and service management guide is in [docs/windows-service-management.md](docs/windows-service-management.md).
The Galaxy S25 native-phone plan is in [docs/galaxy-s25-native.md](docs/galaxy-s25-native.md).
The public GitHub Pages login and RTX backend plan is in [docs/public-auth-deployment.md](docs/public-auth-deployment.md).
The step-by-step ngrok and Firebase testing runbook is in [docs/ngrok-firebase-testing.md](docs/ngrok-firebase-testing.md).

- It works as a polished demo on `github.io` with a built-in simulated live subtitle flow.
- It can also connect to a separately deployed backend over `https://` and `wss://`.
- GitHub Pages cannot run Python, WebSocket servers, or GPU inference by itself, so the real live translation still needs the FastAPI backend running somewhere else.

To publish it with GitHub Pages, push the repo to GitHub and set Pages to deploy from the `/docs` folder on your default branch.

## Deploy process for phone or another laptop

Use this order when the RTX PC is the server and a phone or laptop is the microphone client:

1. Run locally on the host PC first: start `python main.py` and open `http://127.0.0.1:8000`.
2. Bind the backend to the LAN: set `APP_HOST=0.0.0.0`, start the backend, and verify `http://192.168.0.20:8000/api/health`.
3. Open firewall ports on the host PC: allow TCP `8000` for health checks and TCP `8443` for HTTPS.
4. Put HTTPS in front of FastAPI: use Caddy or another reverse proxy from `https://192.168.0.20:8443` to `http://127.0.0.1:8000`.
5. Open the HTTPS URL on the phone: allow microphone permission, speak Korean, and let the PC GPU return English subtitles.

Current standalone project path:

```powershell
C:\Users\n\source\repos\Transcribe_translate
```

If Caddy is not installed or not in `PATH`, start the LAN HTTPS server directly with Uvicorn:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-lan-https.ps1
```

After Firebase is configured, start the protected Google-login backend with:

```powershell
.\start-protected-https.ps1 `
  -FirebaseProjectId "your-firebase-project-id" `
  -AdminEmails "your-email@gmail.com"
```

For normal daily operation after setup, use:

```powershell
.\start-translator-stack.ps1
.\status-translator-stack.ps1
.\stop-translator-stack.ps1
```

The protected startup uses safe defaults for one RTX 4080 Super:

- Maximum active live sessions: `4`
- Idle disconnect: `5` minutes without microphone audio
- Translation backlog: `2` queued speech segments
- New-session GPU temperature limit: `85C`

Admins can see active sessions, last audio time, queue drops, and GPU temperature from the website admin panel after signing in.

You can try `-MaxActiveSessions 8` for mostly idle users, but the RTX 4080 Super still runs one shared inference pipeline. If many people speak at the same time, latency and dropped queued segments can increase.

Then open:

```text
https://192.168.0.20:8443/
https://192.168.0.20:8443/api/health
```

Important: `http://192.168.0.20:8000` may load on a phone, but the microphone is normally blocked because it is not a secure browser context. Use HTTPS for phone and second-laptop microphone tests.

## Galaxy S25 usage options

The best first use of a Galaxy S25 is as the microphone/browser client while the RTX 4080 Super PC runs `large-v3`. This gives the strongest Korean recognition and English translation quality.

For outside-the-house S25 access, keep the RTX PC at home and use the public GitHub Pages frontend with Firebase login plus a protected backend URL from ngrok or DuckDNS + Caddy. Avoid direct router port-forwarding unless authentication, HTTPS, and admin approval are enabled.

A phone-only native app is also possible, but it should use Android-native AI paths: Kotlin, Android audio APIs, ML Kit Translation for Korean-to-English text, and either Android on-device speech recognition or Qualcomm AI Hub WhisperKit Android with Whisper Tiny/Base. The S25 NPU is useful only when the model and runtime support it; desktop `large-v3` will not automatically run on the phone NPU.

## Why this model choice

- OpenAI's Whisper documentation says multilingual models such as `small` and `medium` support speech-to-English translation, while `turbo` is faster but is not trained for translation.
- OpenAI's published memory guide lists `small` at roughly 2 GB VRAM and `medium` at roughly 5 GB VRAM, which makes them realistic targets for an A1000-class 8 GB GPU.
- `faster-whisper` uses CTranslate2 and documents lower memory use plus faster inference than the reference Whisper implementation, including 8-bit GPU modes.

For that reason, this app defaults to `medium` for better translation quality, while still allowing you to switch to `small` if you want lower latency.

## Architecture

1. The browser captures microphone audio.
2. Audio is downsampled to 16 kHz mono PCM and streamed to the backend over WebSocket.
3. A VAD segmenter groups speech into utterances.
4. Each utterance is translated from the selected source language to the selected target language.
5. Whisper handles speech recognition and direct speech-to-English translation. Non-English targets can use an optional local text translation model after the English pivot.
6. The browser renders source transcript and target translation in two scrollable, copyable text boxes.

## Quick start

1. Create and activate a virtual environment.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

2. Install dependencies.

```powershell
pip install -r requirements.txt
```

3. Start the app.

```powershell
python main.py
```

4. Open `http://127.0.0.1:8000`.

## Using the static frontend with a backend

If you deploy the backend to a public host, the GitHub Pages site can connect to it.

- Backend health endpoint: `/api/health`
- Backend websocket endpoint: `/ws`
- The backend now enables CORS so a static site on another origin can call the health endpoint.

Important: a page served from `https://username.github.io` cannot connect to plain `http://127.0.0.1:8000` because browsers block mixed-content requests from HTTPS pages. For GitHub Pages, use an `https://` backend with `wss://` websocket support.

## Optional login and admin approval

The GitHub Pages frontend can optionally use Firebase Auth for Google/Facebook sign-in. The backend can enforce auth with `AUTH_REQUIRED=true`, verify Firebase ID tokens, store users locally in SQLite, and allow only `approved` users to open the live WebSocket.

Keep private control material only on the RTX PC:

```powershell
$env:FIREBASE_CREDENTIALS_FILE="C:\Users\n\secrets\firebase-service-account.json"
$env:ADMIN_EMAILS="your-email@gmail.com"
```

Do not commit Firebase Admin service account JSON, ngrok tokens, or approval databases. The browser Firebase web config is public-facing and can be generated during GitHub Pages deployment from GitHub Actions variables.

## Useful configuration

These environment variables let you tune the app for your hardware:

```powershell
$env:WHISPER_MODEL="small"
$env:WHISPER_DEVICE="auto"
$env:WHISPER_COMPUTE_TYPE="auto"
$env:SOURCE_LANGUAGE="ko"
$env:TARGET_LANGUAGE="en"
$env:SHOW_SOURCE_TEXT="true"
$env:MIN_AUDIO_RMS="0.0035"
$env:NO_SPEECH_THRESHOLD="0.55"
python main.py
```

### Suggested presets

- A1000-class 8 GB GPU: `WHISPER_MODEL=medium`
- If latency is more important than quality: `WHISPER_MODEL=small`
- CPU fallback: `WHISPER_DEVICE=cpu`

## Notes

- The first launch may take a while because the model weights need to be downloaded.
- If your GPU runtime cannot load the selected compute mode, the app will automatically fall back to a safer mode.
- `SOURCE_LANGUAGE=ko` and `TARGET_LANGUAGE=en` are startup defaults, but the browser can change the language pair per session.
- `SHOW_SOURCE_TEXT=true` is the default because the UI is designed to show source text beside the translation. Set it to `false` only when you need the lowest possible latency.
- `MIN_AUDIO_RMS`, `NO_SPEECH_THRESHOLD`, `LOG_PROB_THRESHOLD`, and `COMPRESSION_RATIO_THRESHOLD` help reject silence/noise chunks that Whisper may otherwise turn into fake phrases such as "thanks for watching".

## Optional non-English targets

Whisper's built-in `translate` task outputs English. To translate speech into another target language, the backend first pivots through English and then uses a local text translation model.

```powershell
pip install -r requirements-text-translation.txt
$env:ENABLE_TEXT_TRANSLATION="true"
$env:TEXT_TRANSLATION_MODEL="facebook/nllb-200-distilled-600M"
python main.py
```

Without this optional text translation stack, targets other than English will show a clear backend message instead of silently pretending to work.
