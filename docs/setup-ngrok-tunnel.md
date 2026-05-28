# Setup: ngrok Public HTTPS Tunnel

Use this checklist when you want to access the home RTX PC from another network without installing Tailscale or changing router settings.

## What The Words Mean

- ngrok tunnel: an outbound connection from the RTX PC to ngrok that creates a public HTTPS URL.
- HTTPS/WSS: secure HTTP and secure WebSocket. Browser microphone and live audio streaming need this for public access.
- Backend origin: the public ngrok URL without `/api/health` or `/ws`.

## Before You Start

- The protected backend can run locally on `https://127.0.0.1:8443`.
- ngrok is installed.
- Your ngrok authtoken has already been added on this PC.
- Firebase protection is enabled before you share the public URL.

## Install Or Update ngrok

If ngrok was installed with winget, this path usually works:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok version
```

If your ngrok agent is too old, update it:

```powershell
& $ngrok update
```

If needed, download the latest ngrok from:

```text
https://ngrok.com/download
```

## Add The Authtoken Once

Do not commit or share the token.

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok config add-authtoken "PASTE_YOUR_NGROK_TOKEN_HERE"
```

## Start The Tunnel

Start the protected backend first, then run:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok http https://127.0.0.1:8443 --host-header=rewrite
```

ngrok prints a forwarding URL like:

```text
https://abc123.ngrok-free.app
```

That URL is the backend origin.

## Test From GitHub Pages

1. Open the app:

   ```text
   https://buicongnguyen.github.io/ko-en-live-translator/
   ```

2. Open `Connect to server`.
3. Sign in with Google.
4. Paste the ngrok URL into `Backend origin`.
5. Press `Connect backend`.
6. Allow microphone permission.

## Common Problems

- `ERR_NGROK_121`: the ngrok agent is too old. Run `ngrok update` or install the newest ngrok.
- `ERR_NGROK_334`: that static endpoint is already online. Stop the old ngrok process or reuse the existing tunnel.
- Browser shows a warning page: refresh the frontend after the latest deploy; the app sends the `ngrok-skip-browser-warning` header for API calls.
- Do not paste `https://abc123.ngrok-free.app/api/health` into the app. Paste only `https://abc123.ngrok-free.app`.
