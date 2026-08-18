# WiPay Backup Sync Script
$remoteUser = "root"
$remoteHost = "ugpay.tech"
$remoteDir = "/var/www/backups/"
$localDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "WiPay_Backups"

# Create local directory if it doesn't exist
if (!(Test-Path $localDir)) {
    New-Item -ItemType Directory -Path $localDir
}

Write-Host "--- Starting WiPay Backup Sync ---" -ForegroundColor Cyan

# Sync files from server to PC
# -p preserves timestamps, -q is quiet
scp -p -r "$($remoteUser)@$($remoteHost):$($remoteDir)*" "$localDir"

Write-Host "--- Sync Complete! ---" -ForegroundColor Green
Write-Host "Backups saved to: $localDir"
