# Setup: Windows RTX Backend Service

Use this checklist on the Windows 11 Pro RTX 4080 Super host PC.

## What The Words Mean

- FastAPI backend: the Python server that receives microphone audio and sends transcript/translation events.
- Uvicorn: the Python process that serves FastAPI on port `8443`.
- Stack scripts: PowerShell helpers that start, stop, restart, and check the backend plus ngrok.

## Before You Start

Confirm these are already prepared:

- Repository path:

  ```text
  C:\Users\n\source\repos\Transcribe_translate
  ```

- Python virtual environment exists:

  ```text
  C:\Users\n\source\repos\Transcribe_translate\.venv\Scripts\python.exe
  ```

- HTTPS certificate files exist in `https\`.
- Firebase Admin JSON exists outside the repo:

  ```text
  C:\Users\n\secrets\firebase-service-account.json
  ```

- ngrok is installed and authenticated.
- Local stack config exists:

  ```powershell
  Copy-Item .\translator-stack.local.example.psd1 .\translator-stack.local.psd1
  notepad .\translator-stack.local.psd1
  ```

  Fill in your Firebase project ID, admin email, Firebase Admin JSON path, and backend origin. The local config file is ignored by Git.

## Daily Start

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1
```

The script starts:

- protected backend on `https://127.0.0.1:8443`
- ngrok tunnel to that backend
- safe defaults for session limit, idle timeout, queue size, and GPU temperature guard

## Check Status

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\status-translator-stack.ps1
```

Expected protected-mode status:

```text
Backend: running on port 8443
Backend health: 401 auth required (expected for protected mode)
ngrok: tracked process running (PID ...)
ngrok target: https://127.0.0.1:8443
ngrok public URL: https://...
Open app: https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=...
```

Copy the printed `Open app` link for testing.

## Restart After Code Changes

Restart only backend:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1 -RestartBackend
```

Restart backend and ngrok:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1 -RestartBackend -RestartNgrok
```

## Stop Everything

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\stop-translator-stack.ps1
```

## Optional Auto Start At Windows Login

This creates a Scheduled Task. It also opens public ngrok access when you log in, so keep Firebase protection enabled.

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\install-startup-task.ps1
```

Remove it:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\uninstall-startup-task.ps1
```

## Troubleshooting

- Port `8443` already used: run `.\stop-translator-stack.ps1`, then start again.
- ngrok already online: run `.\status-translator-stack.ps1` and reuse the printed URL if it targets `https://127.0.0.1:8443`. Otherwise stop the old ngrok endpoint manually or restart this stack with `.\start-translator-stack.ps1 -RestartNgrok`.
- `503` from backend: install requirements and restart:

  ```powershell
  .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  .\start-translator-stack.ps1 -RestartBackend
  ```
