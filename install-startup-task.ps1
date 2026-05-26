param(
    [string]$TaskName = "LiveTranslatorProtectedStack"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartScript = Join-Path $ProjectRoot "start-translator-stack.ps1"
$Pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source

if (-not $Pwsh) {
    $Pwsh = (Get-Command powershell -ErrorAction Stop).Source
}

if (-not (Test-Path -LiteralPath $StartScript)) {
    throw "Start script was not found at $StartScript."
}

$action = New-ScheduledTaskAction `
    -Execute $Pwsh `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 30)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Starts the protected Live Translator backend and ngrok tunnel at Windows logon." `
    -Force | Out-Null

Write-Host "Installed startup task: $TaskName"
Write-Host "It starts when this Windows user logs in."
Write-Host ""
Write-Host "Test it now with:"
Write-Host "Start-ScheduledTask -TaskName `"$TaskName`""
