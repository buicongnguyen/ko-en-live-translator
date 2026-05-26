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
