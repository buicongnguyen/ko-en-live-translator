# Windows Startup And Service Management

This app runs as two local processes:

- Protected FastAPI backend on `https://127.0.0.1:8443`
- ngrok tunnel forwarding a public HTTPS URL to that backend

The backend uses Firebase Admin credentials from:

```text
C:\Users\n\secrets\firebase-service-account.json
```

The ngrok token is stored by ngrok in the user's local ngrok config, not in this repo.

## Daily Commands

Start everything:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1
```

Check status and get the public test link:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\status-translator-stack.ps1
```

Stop backend and ngrok:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\stop-translator-stack.ps1
```

Restart both:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\start-translator-stack.ps1 -RestartBackend -RestartNgrok
```

## Install Auto Start At Windows Logon

This installs a Windows Scheduled Task. It starts when your Windows user logs in.

Important: this also opens the public ngrok tunnel at login. Keep Firebase protection enabled.

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\install-startup-task.ps1
```

Test the task immediately:

```powershell
Start-ScheduledTask -TaskName "LiveTranslatorProtectedStack"
```

View task status:

```powershell
Get-ScheduledTask -TaskName "LiveTranslatorProtectedStack"
Get-ScheduledTaskInfo -TaskName "LiveTranslatorProtectedStack"
```

Remove auto start:

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate
.\uninstall-startup-task.ps1
```

## Which URL To Use

Run:

```powershell
.\status-translator-stack.ps1
```

Copy the printed GitHub Pages URL. It includes the current ngrok backend origin.

If ngrok creates a new URL after restart, use the new URL. Free ngrok URLs may change.

## Safety Limits

The normal startup script protects the single RTX 4080 Super GPU with these defaults:

```text
MAX_ACTIVE_SESSIONS=2
IDLE_TIMEOUT_SECONDS=300
MAX_TRANSLATION_QUEUE_SEGMENTS=2
GPU_MAX_TEMPERATURE_C=85
```

Meaning:

- `MAX_ACTIVE_SESSIONS=2` allows two browsers to hold a live backend connection at the same time. A third user receives a busy message instead of overloading the GPU.
- `IDLE_TIMEOUT_SECONDS=300` closes a browser session after five minutes without microphone audio.
- `MAX_TRANSLATION_QUEUE_SEGMENTS=2` keeps translation live by dropping older queued speech if the GPU falls behind.
- `GPU_MAX_TEMPERATURE_C=85` blocks new translation sessions if `nvidia-smi` reports the GPU at or above 85C.

To test three simultaneous users later:

```powershell
.\start-translator-stack.ps1 -RestartBackend -MaxActiveSessions 3
```

Start with `2` for normal use. Increase only if latency stays acceptable and the GPU temperature stays comfortably below 85C.

The admin panel in the website shows:

- Active sessions and the maximum allowed sessions.
- Each connected user's email.
- Connected time and last microphone-audio time.
- Current translation queue size and dropped segment count.
- GPU temperature when `nvidia-smi` is available.

## GPU Temperature Care

For long sessions, keep the RTX PC in a cool, ventilated position. Avoid blocking the case intake/exhaust, and do not run heavy games or GPU workloads at the same time as live translation.

Useful host-PC check:

```powershell
nvidia-smi
```

General guidance:

- Below 75C is comfortable.
- 75C to 84C is usable but worth watching.
- 85C or higher means pause new sessions, improve airflow, or lower load.

## Troubleshooting

If backend says port `8443` is already used:

```powershell
.\stop-translator-stack.ps1 -KeepNgrok
.\start-translator-stack.ps1
```

If ngrok says the endpoint is already online, ngrok is already running. Use:

```powershell
.\status-translator-stack.ps1
```

If `Connect backend` returns `401`, sign in with Google first.

If `Connect backend` returns `503`, install requirements and restart:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\start-translator-stack.ps1 -RestartBackend
```

If you want to temporarily stop public access but keep the local backend running:

```powershell
Get-Process -Name ngrok | Stop-Process
```
