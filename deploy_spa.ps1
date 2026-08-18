param(
    [string]$User = "root",
    [string]$Ip,
    [string]$KeyPath
)

if (-not $Ip) {
    Write-Error "Usage: .\deploy_spa.ps1 -User <user> -Ip <ip_address> [-KeyPath <path_to_private_key>]"
    exit 1
}

$ErrorActionPreference = "Stop"

# Ensure node and npm are in PATH
$nodePaths = @(
    "C:\Program Files\nodejs",
    "$env:APPDATA\npm",
    "$env:USERPROFILE\AppData\Roaming\npm",
    "$env:USERPROFILE\AppData\Local\Programs\node"
)
foreach ($p in $nodePaths) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
    }
}

Write-Host "Building React SPA frontend (wipay-frontend)..." -ForegroundColor Cyan
if (Test-Path "wipay-frontend\package.json") {
    Push-Location wipay-frontend
    cmd.exe /c npm run build
    Pop-Location
} else {
    Write-Error "wipay-frontend directory or package.json not found."
    exit 1
}

if (-not (Test-Path "wipay-frontend\dist")) {
    Write-Error "Frontend build directory wipay-frontend\dist does not exist."
    exit 1
}

Write-Host "Packaging React SPA App files (dist & server)..." -ForegroundColor Cyan
tar -czf deploy_spa.tar.gz --exclude "node_modules" --exclude ".env" --exclude ".git" wipay-frontend/dist server

if (-not (Test-Path "deploy_spa.tar.gz")) {
    Write-Error "Failed to create deploy_spa.tar.gz"
    exit 1
}

$remoteCommands = @'
    echo '1. Extracting React SPA Update...'
    mkdir -p /tmp/wipay_spa_update
    tar -xzf /tmp/deploy_spa.tar.gz -C /tmp/wipay_spa_update

    echo '2. Cleaning old build folders and ensuring SPA Directories Exist (/var/www/wipay_SPA & /var/www/wipay-spa-server)...'
    rm -rf /var/www/wipay-react /var/www/wipay 2>/dev/null || true
    mkdir -p /var/www/wipay_SPA /var/www/wipay-spa-server

    # Deploy React SPA build files to /var/www/wipay_SPA
    if [ -d "/tmp/wipay_spa_update/wipay-frontend/dist" ]; then
        echo 'Deploying React SPA Frontend dist files to /var/www/wipay_SPA...'
        rm -rf /var/www/wipay_SPA/*
        cp -r /tmp/wipay_spa_update/wipay-frontend/dist/* /var/www/wipay_SPA/
    fi

    # Deploy Node.js server to /var/www/wipay-spa-server
    if [ -d "/tmp/wipay_spa_update/server" ]; then
        echo 'Deploying SPA Server files...'
        cp -r /tmp/wipay_spa_update/server/* /var/www/wipay-spa-server/
    fi

    echo '3. Ensuring Environment File in /var/www/wipay-spa-server (.env with PORT=5010)...'
    if [ -f "/var/www/wipay-server/.env" ]; then
        cp /var/www/wipay-server/.env /var/www/wipay-spa-server/.env
    elif [ -f "/var/www/wipay/.env" ]; then
        cp /var/www/wipay/.env /var/www/wipay-spa-server/.env
    else
        touch /var/www/wipay-spa-server/.env
    fi

    if grep -q "^PORT=" /var/www/wipay-spa-server/.env; then
        sed -i 's/^PORT=.*/PORT=5010/' /var/www/wipay-spa-server/.env
    else
        echo "PORT=5010" >> /var/www/wipay-spa-server/.env
    fi

    echo '4. Setting up Nginx & Requesting SSL Certificate for wifi.ugpay.tech...'
    # First, temporarily configure HTTP site so Let's Encrypt challenge can succeed
    cat > /etc/nginx/sites-available/wifi.ugpay.tech <<'HTTP_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name wifi.ugpay.tech;

    root /var/www/wipay_SPA;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
HTTP_CONF

    mkdir -p /etc/nginx/sites-enabled
    ln -sf /etc/nginx/sites-available/wifi.ugpay.tech /etc/nginx/sites-enabled/wifi.ugpay.tech
    systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true

    # Issue SSL certificate if not already existing for wifi.ugpay.tech
    if [ ! -f "/etc/letsencrypt/live/wifi.ugpay.tech/fullchain.pem" ]; then
        echo 'Requesting new SSL certificate for wifi.ugpay.tech via Certbot...'
        if ! command -v certbot >/dev/null 2>&1; then
            apt-get update -y && apt-get install -y certbot python3-certbot-nginx
        fi

        certbot certonly --nginx -d wifi.ugpay.tech --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null || \
        certbot certonly --webroot -w /var/www/wipay_SPA -d wifi.ugpay.tech --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null || true
    fi

    CERT_FILE=""
    KEY_FILE=""
    if [ -f "/etc/letsencrypt/live/wifi.ugpay.tech/fullchain.pem" ]; then
        CERT_FILE="/etc/letsencrypt/live/wifi.ugpay.tech/fullchain.pem"
        KEY_FILE="/etc/letsencrypt/live/wifi.ugpay.tech/privkey.pem"
        echo 'Found dedicated SSL certificate for wifi.ugpay.tech!'
    fi

    if [ -n "$CERT_FILE" ]; then
        cat > /etc/nginx/sites-available/wifi.ugpay.tech <<NGINX_CONF
server {
    listen 80;
    listen [::]:80;
    server_name wifi.ugpay.tech;

    root /var/www/wipay_SPA;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control no-cache;
        error_page 405 =200 \$uri;
    }

    location /api {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name wifi.ugpay.tech;

    ssl_certificate $CERT_FILE;
    ssl_certificate_key $KEY_FILE;

    root /var/www/wipay_SPA;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control no-cache;
        error_page 405 =200 \$uri;
    }

    location /api {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX_CONF
    else
        echo 'WARNING: Dedicated SSL certificate for wifi.ugpay.tech not found. Serving HTTP on Port 80.'
        cat > /etc/nginx/sites-available/wifi.ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name wifi.ugpay.tech;

    root /var/www/wipay_SPA;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control no-cache;
    }

    location /api {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF
    fi

    echo '5. Testing and Reloading Nginx...'
    nginx -t
    systemctl restart nginx || service nginx restart

    echo '6. Installing Dependencies in /var/www/wipay-spa-server...'
    if [ -d "/var/www/wipay-spa-server" ]; then
        cd /var/www/wipay-spa-server && npm install --production
    fi

    echo '7. Restarting PM2 Process wipay-spa-backend on Port 5010...'
    pm2 delete ugpay 2>/dev/null || true
    pm2 delete wipay-spa-backend 2>/dev/null || true
    cd /var/www/wipay-spa-server && pm2 start server.js --name wipay-spa-backend
    pm2 save
    sleep 2

    echo '7b. Initializing WireGuard VPN & FreeRADIUS Services...'
    ufw allow 51820/udp 2>/dev/null || true
    ufw allow 1812/udp 2>/dev/null || true
    ufw allow 1813/udp 2>/dev/null || true
    systemctl enable wg-quick@wg0 2>/dev/null || true
    systemctl start wg-quick@wg0 2>/dev/null || wg-quick up wg0 2>/dev/null || true
    wg-quick strip wg0 > /tmp/wg0.stripped 2>/dev/null && wg syncconf wg0 /tmp/wg0.stripped 2>/dev/null || true

    echo '7c. Configuring FreeRADIUS Clients & BlastRADIUS Bypass for WireGuard VPN Subnet (10.66.66.0/24)...'
    if [ -f "/etc/freeradius/3.0/clients.conf" ]; then
        if ! grep -q "10.66.66.0/24" /etc/freeradius/3.0/clients.conf; then
            cat >> /etc/freeradius/3.0/clients.conf <<'CLIENTS_CONF'

# WiPay WireGuard Routers Subnet
client vpn_routers {
    ipaddr = 10.66.66.0/24
    secret = secret123
    shortname = vpn_routers
    require_message_authenticator = no
    limit_proxy_state = no
}
CLIENTS_CONF
            echo 'Added 10.66.66.0/24 client subnet to FreeRADIUS clients.conf.'
        else
            if ! grep -q 'require_message_authenticator' /etc/freeradius/3.0/clients.conf; then
                sed -i '/client vpn_routers {/a \    require_message_authenticator = no\n    limit_proxy_state = no' /etc/freeradius/3.0/clients.conf 2>/dev/null || true
            fi
        fi
    fi

    echo '7d. Enabling & Configuring MySQL Database Module in FreeRADIUS...'
    ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true
    
    if [ -f "/etc/freeradius/3.0/sites-available/default" ]; then
        sed -i 's/^[[:space:]]*#[[:space:]]*sql[[:space:]]*$/\tsql/g' /etc/freeradius/3.0/sites-available/default 2>/dev/null || true
    fi
    if [ -f "/etc/freeradius/3.0/sites-available/inner-tunnel" ]; then
        sed -i 's/^[[:space:]]*#[[:space:]]*sql[[:space:]]*$/\tsql/g' /etc/freeradius/3.0/sites-available/inner-tunnel 2>/dev/null || true
    fi

    # Update mods-available/sql with exact wipay database credentials & disable dummy TLS SSL ca_file
    if [ -f "/etc/freeradius/3.0/mods-available/sql" ]; then
        sed -i 's/driver = .*/driver = "rlm_sql_mysql"/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/server = .*/server = "127.0.0.1"/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/port = .*/port = 3306/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/login = .*/login = "wipay_user"/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/password = .*/password = "W1pay_local_pw_2026"/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/radius_db = .*/radius_db = "wipay"/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/^[[:space:]]*ca_file =/# ca_file =/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/^[[:space:]]*certificate_file =/# certificate_file =/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/^[[:space:]]*private_key_file =/# private_key_file =/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
        sed -i 's/^[[:space:]]*ca_path =/# ca_path =/' /etc/freeradius/3.0/mods-available/sql 2>/dev/null || true
    fi

    # Clean any invalid directives in radiusd.conf
    if [ -f "/etc/freeradius/3.0/radiusd.conf" ]; then
        sed -i '/require_message_authenticator/d' /etc/freeradius/3.0/radiusd.conf 2>/dev/null || true
        sed -i '/limit_proxy_state/d' /etc/freeradius/3.0/radiusd.conf 2>/dev/null || true
    fi

    echo '=== FREERADIUS SYNTAX CHECK ==='
    freeradius -Cx 2>&1 || true
    systemctl restart freeradius 2>/dev/null || true

    echo '=== WIREGUARD STATUS ==='
    wg show 2>&1 || echo 'WireGuard interface wg0 is not active.'
    echo '=== WG0.CONF CONTENT ==='
    cat /etc/wireguard/wg0.conf 2>&1 || echo 'No /etc/wireguard/wg0.conf found.'
    echo '=== FREERADIUS STATUS ==='
    systemctl status freeradius --no-pager -l 2>&1 | head -n 8 || true
    echo '=== FREERADIUS RECENT LOGS ==='
    tail -n 15 /var/log/freeradius/radius.log 2>&1 || true
    echo '========================='

    echo '8. Cleanup...'
    rm -rf /tmp/deploy_spa.tar.gz /tmp/wipay_spa_update

    echo 'React SPA Deployment Complete!'
'@

$cleanCommands = $remoteCommands.Replace("`r`n", "`n")

if ($KeyPath) {
    Write-Host "Uploading React SPA tarball to ${Ip} (using key: ${KeyPath})..." -ForegroundColor Cyan
    scp -i $KeyPath deploy_spa.tar.gz "${User}@${Ip}:/tmp/deploy_spa.tar.gz"
    
    Write-Host "Executing Remote SPA Deployment..." -ForegroundColor Cyan
    ssh -i $KeyPath "${User}@${Ip}" $cleanCommands
}
else {
    Write-Host "Uploading React SPA tarball to ${Ip} (using default auth)..." -ForegroundColor Cyan
    scp deploy_spa.tar.gz "${User}@${Ip}:/tmp/deploy_spa.tar.gz"
    
    Write-Host "Executing Remote SPA Deployment..." -ForegroundColor Cyan
    ssh "${User}@${Ip}" $cleanCommands
}

Write-Host "React SPA Deployment finished successfully!" -ForegroundColor Green
Remove-Item "deploy_spa.tar.gz" -ErrorAction SilentlyContinue
