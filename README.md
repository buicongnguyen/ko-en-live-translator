# Live Korean-to-English Translator

This project is a local web app for near-real-time Korean-to-English speech translation on a GPU-equipped PC or laptop.

## GitHub Pages frontend

There is now a static frontend in [docs/index.html](/C:/Users/n/source/repos/rambo_game/Transcribe_translate/docs/index.html) that is ready to publish with GitHub Pages.

- It works as a polished demo on `github.io` with a built-in simulated live subtitle flow.
- It can also connect to a separately deployed backend over `https://` and `wss://`.
- GitHub Pages cannot run Python, WebSocket servers, or GPU inference by itself, so the real live translation still needs the FastAPI backend running somewhere else.

To publish it with GitHub Pages, push the repo to GitHub and set Pages to deploy from the `/docs` folder on your default branch.

## Why this model choice

- OpenAI's Whisper documentation says multilingual models such as `small` and `medium` support speech-to-English translation, while `turbo` is faster but is not trained for translation.
- OpenAI's published memory guide lists `small` at roughly 2 GB VRAM and `medium` at roughly 5 GB VRAM, which makes them realistic targets for an A1000-class 8 GB GPU.
- `faster-whisper` uses CTranslate2 and documents lower memory use plus faster inference than the reference Whisper implementation, including 8-bit GPU modes.

For that reason, this app defaults to `medium` for better translation quality, while still allowing you to switch to `small` if you want lower latency.

## Architecture

1. The browser captures microphone audio.
2. Audio is downsampled to 16 kHz mono PCM and streamed to the backend over WebSocket.
3. A VAD segmenter groups speech into utterances.
4. Each utterance is translated from Korean speech into English with `faster-whisper`.
5. The browser renders the translated English text as a live subtitle feed.

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

## Useful configuration

These environment variables let you tune the app for your hardware:

```powershell
$env:WHISPER_MODEL="small"
$env:WHISPER_DEVICE="auto"
$env:WHISPER_COMPUTE_TYPE="auto"
$env:SHOW_SOURCE_TEXT="true"
python main.py
```

### Suggested presets

- A1000-class 8 GB GPU: `WHISPER_MODEL=medium`
- If latency is more important than quality: `WHISPER_MODEL=small`
- CPU fallback: `WHISPER_DEVICE=cpu`

## Notes

- The first launch may take a while because the model weights need to be downloaded.
- If your GPU runtime cannot load the selected compute mode, the app will automatically fall back to a safer mode.
- `SHOW_SOURCE_TEXT=true` runs an extra transcription pass to display Korean text, so it increases latency.
