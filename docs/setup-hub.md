# Setup Hub

Use this page as the Markdown index for the setup choices shown in `setup-guide.html#setup-hub`.

Public setup hub:

```text
https://buicongnguyen.github.io/ko-en-live-translator/setup-guide.html#setup-hub
```

## Pick One Setup Path

| Setup path | Use when | Markdown checklist |
| --- | --- | --- |
| Access and connect | The RTX backend and ngrok are already running, and you want to test from a browser. | [setup-access-connect.md](setup-access-connect.md) |
| Firebase login and admin approval | You want Google login and an approved-email list before people can use the GPU. | [setup-firebase-admin.md](setup-firebase-admin.md) |
| ngrok public HTTPS tunnel | You want to access the home RTX PC from outside the house without router setup. | [setup-ngrok-tunnel.md](setup-ngrok-tunnel.md) |
| Windows RTX backend service | You want to start, restart, check, or stop the protected backend on the RTX 4080 Super PC. | [setup-windows-rtx-backend.md](setup-windows-rtx-backend.md) |
| GPU and session safety | You want to protect the single GPU from too many users, stale audio backlog, or high temperature. | [setup-gpu-safety.md](setup-gpu-safety.md) |

## Recommended Order

1. Complete [Firebase login and admin approval](setup-firebase-admin.md).
2. Complete [Windows RTX backend service](setup-windows-rtx-backend.md).
3. Start [ngrok public HTTPS tunnel](setup-ngrok-tunnel.md).
4. Test with [Access and connect](setup-access-connect.md).
5. Before sharing with other people, review [GPU and session safety](setup-gpu-safety.md).

## Important Rule

GitHub Pages is only the frontend. It cannot run the AI model, cannot use the RTX GPU, and cannot forward traffic to your PC by itself. The browser page must connect to a separate HTTPS/WSS backend URL that reaches the Windows RTX PC.

## Related Deep Guides

- [setup-guide.md](setup-guide.md): full Markdown companion to the visual setup page.
- [ngrok-firebase-testing.md](ngrok-firebase-testing.md): detailed ngrok and Firebase testing runbook.
- [windows-service-management.md](windows-service-management.md): startup task and daily process management.
- [windows-rtx4080-deployment.md](windows-rtx4080-deployment.md): RTX 4080 Super deployment notes.
- [public-auth-deployment.md](public-auth-deployment.md): public GitHub Pages login plus protected GPU backend.
- [galaxy-s25-native.md](galaxy-s25-native.md): native Galaxy S25 research path.
- [latency-tuning-plan.md](latency-tuning-plan.md): VAD, buffering, queue, and latency improvement plan.
