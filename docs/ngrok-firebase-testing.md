# Ngrok + Firebase Testing Runbook

This runbook explains how to test the GitHub Pages translator with the RTX 4080 Super PC as the backend.

## Goal

```text
Browser anywhere
  -> GitHub Pages frontend
  -> optional Google login through Firebase
  -> ngrok HTTPS backend URL
  -> RTX 4080 Super local translator
```

GitHub Pages is only the frontend. The GPU work still runs on this PC.

## Current Test Links

GitHub Pages app:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html
```

Same Wi-Fi backend origin:

```text
https://192.168.0.20:8443
```

Pre-filled same Wi-Fi test link:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=https%3A%2F%2F192.168.0.20%3A8443
```

After ngrok is running, the backend origin will look like:

```text
https://abc123.ngrok-free.app
```

Use only the origin in the Backend origin box. Do not add `/api/health` or `/ws`.

## What Must Stay Private

- Do not commit the ngrok authtoken.
- Do not commit Firebase Admin service account JSON.
- Do not commit `data/auth-users.sqlite3`.
- Do not paste private tokens into GitHub Pages or public Markdown.

## Step 1: Confirm The RTX Backend Works On LAN

The RTX backend is currently expected at:

```text
https://192.168.0.20:8443
```

Open this from the RTX PC:

```text
https://127.0.0.1:8443/api/health
```

Open this from another laptop on the same Wi-Fi:

```text
https://192.168.0.20:8443/api/health
```

If the browser warns about the certificate, continue for local testing.

Then open:

```text
https://192.168.0.20:8443/
```

Press `Start mic`, allow microphone permission, and speak Korean.

## Step 2: Install And Configure ngrok

ngrok has already been installed with winget on this PC. If a new PowerShell session does not find `ngrok`, use the full path:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
```

Create or sign in to a free ngrok account:

```text
https://dashboard.ngrok.com/signup
```

Copy your authtoken:

```text
https://dashboard.ngrok.com/get-started/your-authtoken
```

Save the token locally on the RTX PC:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok config add-authtoken "PASTE_YOUR_NGROK_TOKEN_HERE"
```

Important: replace the placeholder with your real token, but do not write the token into this repo.

## Step 3: Start The ngrok Tunnel

Use the current HTTPS backend:

```powershell
$ngrok="$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"
& $ngrok http https://127.0.0.1:8443 --host-header=rewrite
```

ngrok will print a forwarding URL like:

```text
https://abc123.ngrok-free.app
```

Keep this PowerShell window open while testing.

## Step 4: Test GitHub Pages With ngrok

Open:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html
```

Open `Backend connection`.

Paste the ngrok URL into `Backend origin`, for example:

```text
https://abc123.ngrok-free.app
```

Click `Connect backend`.

Click `Start mic`.

Allow microphone permission.

Speak Korean and confirm:

- Korean text appears in the left transcript box.
- English translation appears in the right transcript box.
- Latency and audio duration update.

## Step 5: Understand The Firebase Message

If you see this:

```text
Firebase login is not configured yet.
```

That means Google/Facebook login is not enabled in the GitHub Pages frontend yet.

It does not block demo mode.

It does not block an unprotected backend.

It will block protected admin login until Firebase is configured.

## Step 6: Configure Firebase Google Login

Create a Firebase project:

```text
https://console.firebase.google.com/
```

Enable Google login:

```text
Firebase Console
  -> Authentication
  -> Sign-in method
  -> Google
  -> Enable
```

Add authorized domains:

```text
buicongnguyen.github.io
localhost
127.0.0.1
```

If Firebase asks for the ngrok domain during testing, add the current ngrok domain too.

## Step 7: Add Firebase Web Config To GitHub

In Firebase project settings, create or open the Web App config.

Add these values to GitHub repository variables. You can either use the GitHub website:

```text
GitHub repo
  -> Settings
  -> Secrets and variables
  -> Actions
  -> Variables
```

Variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_STORAGE_BUCKET
```

These are browser web config values. They are not the Firebase Admin private key.

Or run this local helper script from the repo:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate

.\set-firebase-github-vars.ps1 `
  -ApiKey "firebase-api-key-from-web-config" `
  -AuthDomain "your-project-id.firebaseapp.com" `
  -ProjectId "your-project-id" `
  -AppId "firebase-web-app-id" `
  -MessagingSenderId "firebase-sender-id" `
  -StorageBucket "your-project-id.appspot.com"
```

After saving variables, re-run the GitHub Pages workflow or push a small commit.

## Step 8: Create Firebase Admin Key On RTX PC

Download the Firebase Admin SDK service account JSON from Firebase project settings.

Save it outside the repo, for example:

```text
C:\Users\n\secrets\firebase-service-account.json
```

Do not put this file in GitHub.

## Step 9: Restart Backend With Protected Login

Stop the old backend first if needed:

```powershell
Get-NetTCPConnection -LocalPort 8443 | Select-Object LocalAddress,LocalPort,State,OwningProcess
Stop-Process -Id <OwningProcess>
```

Start the backend with Firebase protection. The helper script below sets `AUTH_REQUIRED=true`, points to the local Firebase Admin JSON, and creates the local approval database:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate

.\start-protected-https.ps1 `
  -FirebaseProjectId "your-firebase-project-id" `
  -AdminEmails "your-email@gmail.com" `
  -FirebaseCredentialsFile "C:\Users\n\secrets\firebase-service-account.json"
```

Replace:

- `your-firebase-project-id`
- `your-email@gmail.com`

Your admin email is automatically approved.

## Step 10: Test Admin Approval

Open GitHub Pages.

Click `Sign in with Google`.

Sign in with the email listed in `ADMIN_EMAILS`.

Enter the ngrok backend origin.

Click `Connect backend`.

If you are admin, the admin panel appears.

For another user:

1. The user signs in with Google.
2. The backend records their email as `pending`.
3. You sign in as admin.
4. Click `Refresh users`.
5. Click `Approve`.
6. The user reconnects and can use `Start mic`.

## Common Problems

If ngrok says `ERR_NGROK_4018`, the authtoken is missing or the account is not verified.

If GitHub Pages says Firebase is not configured, GitHub Actions variables are missing or the Pages workflow has not redeployed yet.

If `Connect backend` fails, check the backend origin:

```text
Correct: https://abc123.ngrok-free.app
Wrong:   https://abc123.ngrok-free.app/api/health
```

If the app says `Unexpected token '<'`, the browser received the ngrok warning page instead of JSON. The frontend now sends the `ngrok-skip-browser-warning` API header; refresh GitHub Pages with `Ctrl + F5` after the newest deploy.

If microphone does not start, use HTTPS. Browser microphone access is blocked on normal LAN HTTP.

If Korean transcript is poor, test with `WHISPER_MODEL=large-v3`, quiet audio, and clear speech.

## Reference Links

- ngrok signup: https://dashboard.ngrok.com/signup
- ngrok authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
- ngrok WebSockets: https://ngrok.com/docs/using-ngrok-with/websockets/
- Firebase console: https://console.firebase.google.com/
- Firebase Google sign-in: https://firebase.google.com/docs/auth/web/google-signin
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens
