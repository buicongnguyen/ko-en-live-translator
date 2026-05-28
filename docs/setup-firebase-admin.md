# Setup: Firebase Login And Admin Approval

Use this checklist when you want only approved Google accounts to access your RTX GPU backend.

## What The Words Mean

- Firebase Auth: Google or Facebook login for the browser app. User passwords stay with Google/Firebase.
- Firebase Web config: public browser settings such as API key, auth domain, project ID, and app ID.
- Firebase Admin service account JSON: private backend key used by Python to verify login tokens. Keep it outside GitHub.
- Admin email: the email that can approve or block other users from the web admin panel.

## Before You Start

- You have a Firebase project.
- You can access the GitHub repository settings or use the GitHub CLI.
- The RTX PC has a private folder for secrets, for example `C:\Users\n\secrets`.

## Firebase Console Steps

1. Open Firebase Console:

   ```text
   https://console.firebase.google.com/
   ```

2. Open your project.
3. Go to `Authentication`.
4. Go to `Sign-in method`.
5. Enable `Google`.
6. Add authorized domains:

   ```text
   buicongnguyen.github.io
   localhost
   127.0.0.1
   ```

7. If Firebase requires it during testing, add the current ngrok domain too.
8. Go to Project settings.
9. Create or open a Web app.
10. Copy the Firebase Web app config values.

## Add Public Firebase Web Config To GitHub

These values are public browser config. They are not the Firebase Admin private key.

GitHub Actions variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_STORAGE_BUCKET
```

You can add them in GitHub:

```text
Repository -> Settings -> Secrets and variables -> Actions -> Variables
```

Or run the helper script from the RTX PC:

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

After saving variables, push a small commit or re-run the GitHub Pages workflow so `firebase-config.generated.js` is regenerated.

## Create The Private Firebase Admin Key

1. In Firebase Project settings, open `Service accounts`.
2. Generate a new private key for Firebase Admin SDK.
3. Save it outside the repository:

   ```text
   C:\Users\n\secrets\firebase-service-account.json
   ```

4. Do not commit this JSON file.

## Start Protected Backend

```powershell
Set-Location C:\Users\n\source\repos\Transcribe_translate

.\start-protected-https.ps1 `
  -FirebaseProjectId "your-firebase-project-id" `
  -AdminEmails "your-email@gmail.com" `
  -FirebaseCredentialsFile "C:\Users\n\secrets\firebase-service-account.json"
```

For normal daily startup, copy `translator-stack.local.example.psd1` to `translator-stack.local.psd1`, fill in your local Firebase/admin values, then use `start-translator-stack.ps1`. The local config file is ignored by Git.

## Approve Users

1. The user opens the GitHub Pages app.
2. The user signs in with Google.
3. The backend records the user as `pending`.
4. You sign in as admin.
5. Connect to the backend.
6. Press `Refresh admin`.
7. Press `Approve` for the expected user.
8. The user reconnects and allows microphone permission.

## Security Notes

- Safe to publish: Firebase Web config values.
- Never publish: Firebase Admin service account JSON.
- Never publish: ngrok authtoken.
- Keep `ADMIN_EMAILS` limited to accounts you control.
