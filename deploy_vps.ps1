param(
    [string]$User = "root",
    [string]$Ip,
    [string]$KeyPath
)

if (-not $Ip) {
    Write-Error "Usage: .\deploy_vps.ps1 -User <user> -Ip <ip_address> -KeyPath <path_to_private_key>"
    exit 1
}

$ErrorActionPreference = "Stop"

Write-Host "Packaging files..." -ForegroundColor Cyan
# Create tarball using standard Windows tar (bsdtar)
# Excludes node_modules, .env, .git, and unused files
tar -czf deploy.tar.gz wipay-frontend server --exclude "node_modules" --exclude ".env" --exclude ".git"

if (-not (Test-Path "deploy.tar.gz")) {
    Write-Error "Failed to create deploy.tar.gz"
    exit 1
}

$remoteCommands = @"
    echo '1. Extracting Update...'
    mkdir -p /tmp/wipay_update
    tar -xzf /tmp/deploy.tar.gz -C /tmp/wipay_update

    echo '2. Copying Files...'
    cp -r /tmp/wipay_update/wipay-frontend/dist/* /var/www/wipay-client/
    cp -r /tmp/wipay_update/server/* /var/www/wipay-server/

    echo '3. Installing Dependencies...'
    cd /var/www/wipay-server
    npm install --production

    echo '4. Restarting Backend...'
    pm2 restart wipay-backend

    echo '5. Cleanup...'
    rm -rf /tmp/deploy.tar.gz /tmp/wipay_update

    echo 'Deployment Complete!'
"@

if ($KeyPath) {
    Write-Host "Uploading to ${Ip} (using key: ${KeyPath})..." -ForegroundColor Cyan
    scp -i $KeyPath deploy.tar.gz "${User}@${Ip}:/tmp/deploy.tar.gz"
    
    Write-Host "Deploying on Remote Server..." -ForegroundColor Cyan
    ssh -i $KeyPath "${User}@${Ip}" $remoteCommands
}
else {
    Write-Host "Uploading to ${Ip} (using default auth)..." -ForegroundColor Cyan
    scp deploy.tar.gz "${User}@${Ip}:/tmp/deploy.tar.gz"
    
    Write-Host "Deploying on Remote Server..." -ForegroundColor Cyan
    ssh "${User}@${Ip}" $remoteCommands
}

Write-Host "Done!" -ForegroundColor Green
Remove-Item "deploy.tar.gz" -ErrorAction SilentlyContinue
