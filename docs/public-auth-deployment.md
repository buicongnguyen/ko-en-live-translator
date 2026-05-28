# Public GitHub Pages Login + RTX 4080 Backend Plan

This plan makes the public GitHub Pages site the user-facing app while the RTX 4080 Super PC remains the private AI backend.

```text
User browser anywhere
  -> https://buicongnguyen.github.io/ko-en-live-translator/index.html
  -> Firebase Auth sign-in with Google or Facebook
  -> approved email check on the RTX backend
  -> wss://your-backend-url/ws
  -> RTX 4080 Super FastAPI + faster-whisper
```

GitHub Pages does not forward traffic to the GPU. The browser connects directly from the GitHub Pages frontend to a separate HTTPS backend URL.

## What Is Public And What Must Stay Private

| Item | Where it lives | Safe to publish? | Notes |
| --- | --- | --- | --- |
| GitHub Pages HTML/CSS/JS | GitHub repo `docs/` | Yes | Static frontend only. |
| Firebase web config | GitHub Pages generated `firebase-config.js` | Yes, but restrict domains | This identifies the Firebase project; it is not a Firebase Admin private key. |
| Firebase Admin service account JSON | RTX PC only | No | Keep outside the repo, for example `C:\Users\n\secrets\firebase-service-account.json`. |
| Admin email list | RTX PC environment variable | No | Use `ADMIN_EMAILS`, not committed files. |
| Approved bootstrap emails | RTX PC environment variable | No | Use `APPROVED_EMAILS`, or approve users from the admin panel. |
| User approval database | RTX PC `data/auth-users.sqlite3` | No | Local SQLite state; ignored by Git. |
| ngrok auth token | RTX PC only | No | Needed only if you use ngrok. |

## Current Implementation Status

- The GitHub Pages frontend has optional Firebase sign-in buttons for Google and Facebook.
- The frontend can send a Firebase ID token to `/api/health`.
- The frontend sends the token as the first WebSocket message before microphone audio starts.
- The FastAPI backend can require Firebase auth with `AUTH_REQUIRED=true`.
- The backend stores users as `pending`, `approved`, or `blocked` in SQLite.
- The backend bootstraps admin users from `ADMIN_EMAILS`.
- Admin users can list users and approve, block, or return users to pending from the GitHub Pages UI.
- If Firebase config is not deployed yet, the GitHub Pages app still works in demo mode.

## Step 1: Create Firebase Auth

1. Open Firebase Console and create a project.
2. Open Authentication.
3. Enable Google sign-in.
4. Enable Facebook sign-in if you want Facebook accounts.
5. Add authorized domains:

```text
buicongnguyen.github.io
localhost
127.0.0.1
```

Add your ngrok domain too if Firebase requires it for local testing.

## Step 2: Add Public Firebase Web Config To GitHub Actions Variables

In GitHub:

```text
Repo -> Settings -> Secrets and variables -> Actions -> Variables
```

Add these repository variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_STORAGE_BUCKET
```

The deploy workflow writes those values into `docs/firebase-config.js` during GitHub Pages deployment. Do not put Firebase Admin private key JSON in GitHub variables.

## Step 3: Create A Firebase Admin Service Account On The RTX PC

Download the Firebase Admin SDK service account JSON and save it outside the repo:

```text
C:\Users\n\secrets\firebase-service-account.json
```

Never commit this file. The repo `.gitignore` blocks common service-account filenames, but still keep the file outside the project.

## Step 4: Start The Protected RTX Backend

On the RTX 4080 Super PC:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:APP_HOST="127.0.0.1"
$env:APP_PORT="8000"
$env:WHISPER_MODEL="large-v3"
$env:WHISPER_DEVICE="cuda"
$env:WHISPER_COMPUTE_TYPE="float16"
$env:WHISPER_BEAM_SIZE="1"
$env:SHOW_SOURCE_TEXT="true"

$env:AUTH_REQUIRED="true"
$env:AUTH_PROVIDER="firebase"
$env:FIREBASE_PROJECT_ID="your-firebase-project-id"
$env:FIREBASE_CREDENTIALS_FILE="C:\Users\n\secrets\firebase-service-account.json"
$env:ADMIN_EMAILS="your-email@gmail.com"
$env:APPROVED_EMAILS=""
$env:CORS_ALLOW_ORIGINS="https://buicongnguyen.github.io,http://127.0.0.1:8099"

python main.py
```

With auth on, this unauthenticated check should fail:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8000/api/health -UseBasicParsing
```

That is expected. The browser must send a Firebase ID token.

## Step 5: Give The Backend A Public HTTPS URL

For the first free test, use ngrok:

```powershell
ngrok http 8000
```

Copy the HTTPS forwarding URL, for example:

```text
https://abc123.ngrok-free.app
```

The GitHub Pages frontend will connect to:

```text
https://abc123.ngrok-free.app/api/health
wss://abc123.ngrok-free.app/ws
```

For a more stable no-monthly-cost setup later, use DuckDNS + router port forwarding + Caddy:

```caddyfile
translate-yourname.duckdns.org {
  reverse_proxy 127.0.0.1:8000
}
```

## Step 6: Use The GitHub Pages Site

Open:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html
```

Then:

1. Sign in with Google or Facebook.
2. Enter the backend origin, for example `https://abc123.ngrok-free.app`.
3. Click Connect.
4. If your email is an admin email, open the admin panel and approve pending users.
5. Approved users can press Start mic and use the RTX GPU translator.

## Admin Approval Flow

```text
Unknown user signs in
  -> backend records email as pending
  -> user sees "Access pending"
  -> admin signs in
  -> admin opens same backend origin
  -> admin clicks Refresh users
  -> admin clicks Approve
  -> user reconnects and can translate
```

## GPU Protection To Add Next

Authentication protects who can use the GPU. The next protection layer should limit how much they can use it:

- Maximum active sessions, default `4`; try `8` only for mostly idle users after latency and GPU temperature look stable.
- Idle timeout if no speech is detected.
- GPU temperature guard with `nvidia-smi`.
- Admin dashboard showing active users, GPU temperature, and reject/stop controls.

## Source References

- [GitHub Pages static hosting](https://docs.github.com/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Actions limits](https://docs.github.com/actions/reference/limits)
- [Firebase Authentication](https://firebase.google.com/docs/auth/)
- [ngrok WebSockets](https://ngrok.com/docs/using-ngrok-with/websockets/)
- [DuckDNS](https://www.duckdns.org/)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
