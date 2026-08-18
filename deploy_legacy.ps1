param(
    [string]$User = "root",
    [string]$Ip,
    [string]$KeyPath
)

if (-not $Ip) {
    Write-Error "Usage: .\deploy_legacy.ps1 -User <user> -Ip <ip_address> [-KeyPath <path_to_private_key>]"
    exit 1
}

$ErrorActionPreference = "Stop"

Write-Host "Packaging Legacy Web App files (client & server)..." -ForegroundColor Cyan
tar -czf deploy_legacy.tar.gz --exclude "node_modules" --exclude ".env" --exclude ".git" client server

if (-not (Test-Path "deploy_legacy.tar.gz")) {
    Write-Error "Failed to create deploy_legacy.tar.gz"
    exit 1
}

$remoteCommands = @'
    echo '1. Extracting Legacy Update...'
    mkdir -p /tmp/wipay_legacy_update
    tar -xzf /tmp/deploy_legacy.tar.gz -C /tmp/wipay_legacy_update

    echo '2. Ensuring Target Directories Exist (/var/www/wipay, /var/www/wipay-client & /var/www/wipay-server)...'
    mkdir -p /var/www/wipay /var/www/wipay/server /var/www/wipay-client /var/www/wipay-server

    # Deploy HTML/JS frontend to /var/www/wipay and /var/www/wipay-client
    if [ -d "/tmp/wipay_legacy_update/client" ]; then
        echo 'Deploying Frontend files to /var/www/wipay...'
        cp -r /tmp/wipay_legacy_update/client/* /var/www/wipay/ 2>/dev/null || true
        cp -r /tmp/wipay_legacy_update/client/* /var/www/wipay-client/ 2>/dev/null || true
        if [ -d "/var/www/client" ]; then
            cp -r /tmp/wipay_legacy_update/client/* /var/www/client/ 2>/dev/null || true
        fi
    fi

    # Deploy Node.js server to /var/www/wipay/server, /var/www/wipay, and /var/www/wipay-server
    if [ -d "/tmp/wipay_legacy_update/server" ]; then
        echo 'Deploying Server files to /var/www/wipay/server and /var/www/wipay...'
        cp -r /tmp/wipay_legacy_update/server/* /var/www/wipay/server/ 2>/dev/null || true
        cp -r /tmp/wipay_legacy_update/server/* /var/www/wipay/ 2>/dev/null || true
        cp -r /tmp/wipay_legacy_update/server/* /var/www/wipay-server/ 2>/dev/null || true
    fi

    echo '3. Ensuring Environment File (.env with PORT=5005)...'
    touch /var/www/wipay/.env /var/www/wipay-server/.env
    for envfile in /var/www/wipay/.env /var/www/wipay-server/.env /var/www/wipay/server/.env; do
        if [ -f "$envfile" ]; then
            if grep -q "^PORT=" "$envfile"; then
                sed -i 's/^PORT=.*/PORT=5005/' "$envfile"
            else
                echo "PORT=5005" >> "$envfile"
            fi
        fi
    done
    else
        echo "PORT=5005" >> /var/www/wipay-server/.env
    fi

    echo '4. Configuring Nginx for ugpay.tech (Port 5005)...'
    if [ -f "/etc/letsencrypt/live/ugpay.tech/fullchain.pem" ]; then
        cat > /etc/nginx/sites-available/ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name ugpay.tech www.ugpay.tech;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ugpay.tech www.ugpay.tech;

    ssl_certificate /etc/letsencrypt/live/ugpay.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ugpay.tech/privkey.pem;

    root /var/www/wipay-client;
    index index.html index.php login.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    location /api {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF
    else
        cat > /etc/nginx/sites-available/ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name ugpay.tech www.ugpay.tech;

    root /var/www/wipay-client;
    index index.html index.php login.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    location /api {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_CONF
    fi

    mkdir -p /etc/nginx/sites-enabled
    ln -sf /etc/nginx/sites-available/ugpay.tech /etc/nginx/sites-enabled/ugpay.tech

    echo '5. Testing and Restarting Nginx...'
    nginx -t
    systemctl restart nginx || service nginx restart

    echo '6. Installing Dependencies in /var/www/wipay-server...'
    if [ -d "/var/www/wipay-server" ]; then
        cd /var/www/wipay-server && npm install --production
    fi

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

# WiPay Direct NAS Client
client direct_nas {
    ipaddr = 0.0.0.0/0
    secret = secret123
    shortname = direct_nas
    require_message_authenticator = no
    limit_proxy_state = no
}
CLIENTS_CONF
            echo 'Added client subnets to FreeRADIUS clients.conf.'
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

    # Update mods-available/sql with exact wipay database credentials
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

    echo '7e. Restarting FreeRADIUS Service...'
    systemctl enable freeradius 2>/dev/null || true
    systemctl restart freeradius 2>/dev/null || service freeradius restart 2>/dev/null || true

    echo '7f. Restarting PM2 Backend Services...'
    pm2 restart all 2>/dev/null || true
    if [ -f "/var/www/wipay/server.js" ]; then
        cd /var/www/wipay && pm2 restart wipay-backend 2>/dev/null || pm2 start server.js --name wipay-backend
    elif [ -f "/var/www/wipay/server/server.js" ]; then
        cd /var/www/wipay/server && pm2 restart wipay-backend 2>/dev/null || pm2 start server.js --name wipay-backend
    elif [ -f "/var/www/wipay-server/server.js" ]; then
        cd /var/www/wipay-server && pm2 restart wipay-backend 2>/dev/null || pm2 start server.js --name wipay-backend
    fi
    pm2 save

    echo '8. Cleanup...'
    rm -rf /tmp/deploy_legacy.tar.gz /tmp/wipay_legacy_update

    echo 'Legacy Web App Deployment Complete!'
'@

$cleanCommands = $remoteCommands.Replace("`r`n", "`n")

if ($KeyPath) {
    Write-Host "Uploading Legacy tarball to ${Ip} (using key: ${KeyPath})..." -ForegroundColor Cyan
    scp -i $KeyPath deploy_legacy.tar.gz "${User}@${Ip}:/tmp/deploy_legacy.tar.gz"
    
    Write-Host "Executing Remote Legacy Deployment..." -ForegroundColor Cyan
    ssh -i $KeyPath "${User}@${Ip}" $cleanCommands
}
else {
    Write-Host "Uploading Legacy tarball to ${Ip} (using default auth)..." -ForegroundColor Cyan
    scp deploy_legacy.tar.gz "${User}@${Ip}:/tmp/deploy_legacy.tar.gz"
    
    Write-Host "Executing Remote Legacy Deployment..." -ForegroundColor Cyan
    ssh "${User}@${Ip}" $cleanCommands
}

Write-Host "Legacy Web App Deployment finished successfully!" -ForegroundColor Green
Remove-Item "deploy_legacy.tar.gz" -ErrorAction SilentlyContinue
