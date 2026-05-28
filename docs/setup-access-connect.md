# Setup: Access And Connect To The Backend

Use this checklist when the RTX PC backend and ngrok tunnel are already running.

## What The Words Mean

- Frontend: the GitHub Pages website with the microphone UI and transcript boxes.
- Backend origin: the HTTPS URL that points to the RTX PC, for example an ngrok URL.
- Admin approval: the backend checks whether your signed-in email is allowed to use the GPU.

## Before You Start

- The RTX PC backend is running on port `8443`.
- ngrok is running and shows a forwarding URL such as `https://abc123.ngrok-free.app`.
- Firebase login is configured on the GitHub Pages app.
- Your email is already approved, or you can sign in as the admin email.

## Steps

1. Open the app:

   ```text
   https://buicongnguyen.github.io/ko-en-live-translator/
   ```

2. Open `Connect to server`.
3. In `1 Access`, press `Sign in with Google`.
4. Sign in with the approved Google account.
5. In `2 Backend`, paste only the backend origin:

   ```text
   https://abc123.ngrok-free.app
   ```

6. Do not paste `/api/health` or `/ws`.
7. Press `Connect backend`.
8. If the backend approves your email, the app automatically asks for microphone permission and starts listening.
9. Allow the microphone permission in the browser.
10. Speak and check that source transcript and translation appear.

## Admin User Test

If you are the admin:

1. Sign in with the admin email.
2. Connect the backend.
3. Press `Refresh admin`.
4. Check active sessions, last audio time, queue size, and pending users.
5. Approve a pending user only if you expect that person to use your GPU.

## Quick Link With Backend Filled In

Replace the backend value with the current ngrok URL:

```text
https://buicongnguyen.github.io/ko-en-live-translator/index.html?backend=https%3A%2F%2Fabc123.ngrok-free.app
```

## Troubleshooting

- `401 Unauthorized`: sign in first, or ask the admin to approve your email.
- `503 Service Unavailable`: the backend is reachable but the model or GPU runtime may not be ready.
- `Failed to fetch`: the backend origin is wrong, ngrok is not running, or the browser cannot reach the backend.
- Microphone permission denied: open browser site settings and allow microphone access.
