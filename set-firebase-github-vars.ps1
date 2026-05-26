param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [Parameter(Mandatory = $true)]
    [string]$AuthDomain,

    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $true)]
    [string]$AppId,

    [string]$MessagingSenderId = "",
    [string]$StorageBucket = "",
    [string]$Repo = "buicongnguyen/ko-en-live-translator"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI was not found. Install gh or add the Firebase variables manually in GitHub settings."
}

if ($ApiKey -match "PASTE|your-" -or $AuthDomain -match "PASTE|your-" -or $ProjectId -match "PASTE|your-" -or $AppId -match "PASTE|your-") {
    throw "Replace placeholder Firebase values before running this script."
}

Write-Host "Writing public Firebase web config to GitHub Actions variables for $Repo"
Write-Host "These are browser config values, not the Firebase Admin private key."

gh variable set FIREBASE_API_KEY --repo $Repo --body $ApiKey
gh variable set FIREBASE_AUTH_DOMAIN --repo $Repo --body $AuthDomain
gh variable set FIREBASE_PROJECT_ID --repo $Repo --body $ProjectId
gh variable set FIREBASE_APP_ID --repo $Repo --body $AppId

if ($MessagingSenderId) {
    gh variable set FIREBASE_MESSAGING_SENDER_ID --repo $Repo --body $MessagingSenderId
}

if ($StorageBucket) {
    gh variable set FIREBASE_STORAGE_BUCKET --repo $Repo --body $StorageBucket
}

Write-Host ""
Write-Host "Firebase web config variables are set."
Write-Host "Re-run the Deploy GitHub Pages workflow or push a small commit so firebase-config.js is generated."
