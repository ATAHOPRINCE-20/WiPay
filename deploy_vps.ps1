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

Write-Host "Checking frontend build..." -ForegroundColor Cyan
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd -and (Test-Path "wipay-frontend\package.json")) {
    Write-Host "Building frontend locally with npm..." -ForegroundColor Cyan
    Push-Location wipay-frontend
    try { & npm run build } catch { Write-Host "Local npm build skipped: $_" -ForegroundColor Yellow }
    Pop-Location
} elseif (Test-Path "wipay-frontend\dist") {
    Write-Host "Using existing wipay-frontend\dist build for deployment." -ForegroundColor Yellow
} else {
    Write-Host "Frontend dist folder missing and npm not found locally. Remote server will handle setup." -ForegroundColor Yellow
}

Write-Host "Packaging files..." -ForegroundColor Cyan
# Create tarball including legacy client HTML files
tar -czf deploy.tar.gz --exclude "node_modules" --exclude ".env" --exclude ".git" wipay-frontend server client

if (-not (Test-Path "deploy.tar.gz")) {
    Write-Error "Failed to create deploy.tar.gz"
    exit 1
}

$remoteCommands = @'
    echo '1. Extracting Update...'
    mkdir -p /tmp/wipay_update
    tar -xzf /tmp/deploy.tar.gz -C /tmp/wipay_update

    echo '2. Cleaning up Nginx Backup & Default Files...'
    rm -rf /tmp/nginx_backup
    rm -f /etc/nginx/sites-enabled/default* /etc/nginx/sites-available/default* 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/*.bak* /etc/nginx/sites-enabled/*.old* 2>/dev/null || true

    echo '3. Restoring Legacy Client, React SPA & Server files...'
    mkdir -p /var/www/wipay-client /var/www/wipay-react /var/www/wipay-server

    # 3a. Restore legacy HTML frontend files to /var/www/wipay-client
    if [ -d "/tmp/wipay_update/client" ]; then
        echo 'Deploying Legacy Client to /var/www/wipay-client...'
        cp -r /tmp/wipay_update/client/* /var/www/wipay-client/ 2>/dev/null || true
    fi

    # 3b. Deploy new React SPA frontend to /var/www/wipay-react and /var/www/wipay_SPA
    if [ -d "/tmp/wipay_update/wipay-frontend/dist" ]; then
        echo 'Deploying React SPA to /var/www/wipay-react and /var/www/wipay_SPA...'
        mkdir -p /var/www/wipay-react /var/www/wipay_SPA
        rm -rf /var/www/wipay-react/* /var/www/wipay_SPA/* 2>/dev/null || true
        cp -r /tmp/wipay_update/wipay-frontend/dist/* /var/www/wipay-react/ 2>/dev/null || true
        cp -r /tmp/wipay_update/wipay-frontend/dist/* /var/www/wipay_SPA/ 2>/dev/null || true
    fi

    # 3c. Deploy Node.js backend server and sync uploaded assets
    if [ -d "/tmp/wipay_update/server" ]; then
        echo 'Deploying Node.js backend server across all server locations...'
        mkdir -p /var/www/wipay-server /var/www/wipay-spa-server /var/www/wipay/server /var/www/wipay
        cp -r /tmp/wipay_update/server/* /var/www/wipay-server/ 2>/dev/null || true
        cp -r /tmp/wipay_update/server/* /var/www/wipay-spa-server/ 2>/dev/null || true
        cp -r /tmp/wipay_update/server/* /var/www/wipay/server/ 2>/dev/null || true
        # Ensure .env is preserved and synced across server locations
        if [ -f "/var/www/wipay-server/.env" ]; then
            cp -n /var/www/wipay-server/.env /var/www/wipay-spa-server/.env 2>/dev/null || true
        elif [ -f "/var/www/wipay/.env" ]; then
            cp -n /var/www/wipay/.env /var/www/wipay-spa-server/.env 2>/dev/null || true
        elif [ -f "/root/.env" ]; then
            cp -n /root/.env /var/www/wipay-spa-server/.env 2>/dev/null || true
        fi
        if [ -f "/var/www/wipay-spa-server/.env" ]; then
            cp -n /var/www/wipay-spa-server/.env /var/www/wipay-server/.env 2>/dev/null || true
        fi

        # Bi-directional upload asset synchronization
        mkdir -p /var/www/wipay-server/uploads /var/www/wipay-spa-server/uploads /var/www/wipay-client/uploads /var/www/uploads /root/uploads
        cp -rn /root/uploads/* /var/www/wipay-server/uploads/ 2>/dev/null || true
        cp -rn /var/www/uploads/* /var/www/wipay-server/uploads/ 2>/dev/null || true
        cp -rn /var/www/wipay-client/uploads/* /var/www/wipay-server/uploads/ 2>/dev/null || true
        cp -rn /var/www/wipay-spa-server/uploads/* /var/www/wipay-server/uploads/ 2>/dev/null || true

        # Distribute master uploads back to all web server upload directories
        cp -rn /var/www/wipay-server/uploads/* /var/www/wipay-spa-server/uploads/ 2>/dev/null || true
        cp -rn /var/www/wipay-server/uploads/* /var/www/wipay-client/uploads/ 2>/dev/null || true
        cp -rn /var/www/wipay-server/uploads/* /var/www/uploads/ 2>/dev/null || true
        cp -rn /var/www/wipay-server/uploads/* /root/uploads/ 2>/dev/null || true

        chmod -R 777 /var/www/wipay-server/uploads /var/www/wipay-spa-server/uploads /var/www/wipay-client/uploads /var/www/uploads /root/uploads 2>/dev/null || true
    fi

    echo '4. Configuring Nginx for ugpay.tech (Legacy Client System)...'
    if [ -f "/etc/letsencrypt/live/ugpay.tech/fullchain.pem" ]; then
        cat > /etc/nginx/sites-available/ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name ugpay.tech www.ugpay.tech;
    client_max_body_size 50M;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ugpay.tech www.ugpay.tech;
    client_max_body_size 50M;

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
    }
}
NGINX_CONF
    else
        cat > /etc/nginx/sites-available/ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name ugpay.tech www.ugpay.tech;
    client_max_body_size 50M;

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

    location /uploads/ {
        alias /var/www/wipay-server/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri $uri/ @backend_uploads;
    }

    location @backend_uploads {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_CONF
    fi

    echo '5. Configuring Nginx for wifi.ugpay.tech (React SPA Subdomain)...'
    SSL_CERT=""
    SSL_KEY=""
    if [ -f "/etc/letsencrypt/live/wifi.ugpay.tech/fullchain.pem" ]; then
        SSL_CERT="/etc/letsencrypt/live/wifi.ugpay.tech/fullchain.pem"
        SSL_KEY="/etc/letsencrypt/live/wifi.ugpay.tech/privkey.pem"
    elif [ -f "/etc/letsencrypt/live/ugpay.tech/fullchain.pem" ]; then
        SSL_CERT="/etc/letsencrypt/live/ugpay.tech/fullchain.pem"
        SSL_KEY="/etc/letsencrypt/live/ugpay.tech/privkey.pem"
    fi

    if [ -n "$SSL_CERT" ]; then
        cat > /etc/nginx/sites-available/wifi.ugpay.tech <<NGINX_CONF
server {
    listen 80;
    listen [::]:80;
    server_name wifi.ugpay.tech;
    client_max_body_size 50M;

    root /var/www/wipay-react;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control no-cache;
    }

    location /assets/ {
        expires 1y;
        try_files \$uri =404;
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
    client_max_body_size 50M;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

    root /var/www/wipay-react;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control no-cache;
    }

    location /assets/ {
        expires 1y;
        try_files \$uri =404;
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
        cat > /etc/nginx/sites-available/wifi.ugpay.tech <<'NGINX_CONF'
server {
    listen 80;
    listen [::]:80;
    server_name wifi.ugpay.tech;
    client_max_body_size 50M;

    root /var/www/wipay-react;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control no-cache;
    }

    location /assets/ {
        expires 1y;
        try_files $uri =404;
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
        alias /var/www/wipay-spa-server/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri $uri/ @backend_uploads;
    }

    location /uploads/ {
        alias /var/www/wipay-spa-server/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri $uri/ @backend_uploads;
    }

    location @backend_uploads {
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

    # Enable both ugpay.tech and wifi.ugpay.tech
    mkdir -p /etc/nginx/sites-enabled
    ln -sf /etc/nginx/sites-available/ugpay.tech /etc/nginx/sites-enabled/ugpay.tech
    ln -sf /etc/nginx/sites-available/wifi.ugpay.tech /etc/nginx/sites-enabled/wifi.ugpay.tech

    # Allow firewall ports
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true

    echo '6. Testing and Restarting Nginx...'
    nginx -t
    systemctl restart nginx || service nginx restart

    if systemctl is-active --quiet nginx; then
        echo 'SUCCESS: Nginx is active!'
    else
        echo '=== NGINX DIAGNOSTIC LOG ==='
        journalctl -xeu nginx.service --no-pager -n 25
        echo '=== END DIAGNOSTIC LOG ==='
    fi

    echo '7. Installing Dependencies in /var/www/wipay-server and /var/www/wipay-spa-server...'
    if [ -f "/var/www/wipay-server/package.json" ]; then
        cd /var/www/wipay-server && npm install --production
    fi
    if [ -f "/var/www/wipay-spa-server/package.json" ]; then
        cd /var/www/wipay-spa-server && npm install --production
    fi

    echo '7b. Initializing WireGuard VPN & FreeRADIUS Services...'
    ufw allow 51820/udp 2>/dev/null || true
    ufw allow 1812/udp 2>/dev/null || true
    ufw allow 1813/udp 2>/dev/null || true
    systemctl enable wg-quick@wg0 2>/dev/null || true
    systemctl start wg-quick@wg0 2>/dev/null || wg-quick up wg0 2>/dev/null || true
    wg-quick strip wg0 > /tmp/wg0.stripped 2>/dev/null && wg syncconf wg0 /tmp/wg0.stripped 2>/dev/null || true

    echo '7c. Configuring FreeRADIUS Clients & BlastRADIUS Bypass...'
    cat > /etc/freeradius/3.0/clients.conf <<'CLIENTS_CONF'
# WiPay Global FreeRADIUS NAS Clients Configuration
client default_nas {
    ipaddr = 0.0.0.0/0
    secret = secret123
    shortname = default_nas
    require_message_authenticator = no
    limit_proxy_state = no
}

client default_nas_v6 {
    ipv6addr = ::/0
    secret = secret123
    shortname = default_nas_v6
    require_message_authenticator = no
    limit_proxy_state = no
}
CLIENTS_CONF
    echo 'FreeRADIUS clients.conf configured cleanly.'

    echo '7d. Enabling & Configuring MySQL Database Module in FreeRADIUS...'
    ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true
    
    if [ -f "/etc/freeradius/3.0/dictionary" ]; then
        if ! grep -q "Max-All-Session" /etc/freeradius/3.0/dictionary; then
            echo "ATTRIBUTE Max-All-Session 3000 integer" >> /etc/freeradius/3.0/dictionary
        fi
    fi

    if [ -f "/etc/freeradius/3.0/sites-available/default" ]; then
        sed -i 's/^[[:space:]]*#[[:space:]]*sql[[:space:]]*$/\tsql/g' /etc/freeradius/3.0/sites-available/default 2>/dev/null || true
        sed -i 's/ipaddr = 127.0.0.1/ipaddr = */g' /etc/freeradius/3.0/sites-available/default 2>/dev/null || true
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

    echo '7d2. Ensuring FreeRADIUS Directory Permissions & radacct Schema...'
    chown -R freerad:freerad /etc/freeradius/3.0 /var/log/freeradius 2>/dev/null || true
    chmod -R 755 /etc/freeradius/3.0 2>/dev/null || true
    echo '7d3. Ensuring Clean FreeRADIUS Configuration...'
    QUERIES_CONF="/etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf"
    if [ -f "${QUERIES_CONF}.orig" ]; then
        cp "${QUERIES_CONF}.orig" "$QUERIES_CONF" 2>/dev/null || true
    fi

    echo '7d4. Directly Populating RADIUS Passwords in MySQL...'
    mysql -u wipay_user -pW1pay_local_pw_2026 wipay << 'SQL_EOF' 2>/dev/null || true
ALTER TABLE radpostauth MODIFY pass VARCHAR(255) NOT NULL DEFAULT '';
DELETE FROM radcheck WHERE attribute = 'Max-All-Session';
DELETE t1 FROM radcheck t1 INNER JOIN radcheck t2 WHERE t1.id > t2.id AND t1.username = t2.username AND t1.attribute = t2.attribute;
DELETE t1 FROM radreply t1 INNER JOIN radreply t2 WHERE t1.id > t2.id AND t1.username = t2.username AND t1.attribute = t2.attribute;

UPDATE vouchers v
JOIN packages p ON p.id = v.package_id
LEFT JOIN (
    SELECT username, SUM(acctsessiontime) as total_used 
    FROM radacct 
    GROUP BY username
) a ON (LOWER(a.username) = LOWER(v.code))
SET v.status = 'active'
WHERE v.status = 'expired' AND COALESCE(a.total_used, 0) < (
    CASE 
        WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
        WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
        WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
        ELSE 86400
    END
);

INSERT INTO radcheck (username, attribute, op, value)
SELECT code, 'Cleartext-Password', ':=', code FROM vouchers WHERE (status IS NULL OR status != 'expired') AND code IS NOT NULL AND code != ''
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO radcheck (username, attribute, op, value)
SELECT LOWER(code), 'Cleartext-Password', ':=', LOWER(code) FROM vouchers WHERE (status IS NULL OR status != 'expired') AND code IS NOT NULL AND code != ''
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO radcheck (username, attribute, op, value)
SELECT UPPER(code), 'Cleartext-Password', ':=', UPPER(code) FROM vouchers WHERE (status IS NULL OR status != 'expired') AND code IS NOT NULL AND code != ''
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO radreply (username, attribute, op, value)
SELECT v.code, 'Session-Timeout', ':=', CAST(COALESCE(p.validity_hours * 3600, 86400) AS CHAR)
FROM vouchers v JOIN packages p ON p.id = v.package_id WHERE v.code IS NOT NULL
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO radreply (username, attribute, op, value)
SELECT v.code, 'Idle-Timeout', ':=', CAST(COALESCE(p.idle_timeout_seconds, 300) AS CHAR)
FROM vouchers v JOIN packages p ON p.id = v.package_id WHERE v.code IS NOT NULL
ON DUPLICATE KEY UPDATE value = VALUES(value);

DROP TRIGGER IF EXISTS trg_radacct_session_timeout_insert;
DROP TRIGGER IF EXISTS trg_radacct_session_timeout_update;
SQL_EOF

    echo '7e. Clearing Port 1812/1813 & Restarting FreeRADIUS Service...'
    systemctl stop freeradius 2>/dev/null || true
    pkill -9 freeradius 2>/dev/null || true
    pkill -9 radiusd 2>/dev/null || true
    fuser -k 1812/udp 1813/udp 2>/dev/null || true
    sleep 3
    chown -R freerad:freerad /etc/freeradius/3.0 /var/log/freeradius 2>/dev/null || true
    chmod -R 755 /etc/freeradius/3.0 2>/dev/null || true
    systemctl enable freeradius 2>/dev/null || true
    systemctl start freeradius || systemctl restart freeradius || service freeradius restart || true
    
    # Verify FreeRADIUS service is running
    if ! systemctl is-active --quiet freeradius; then
        echo 'WARNING: FreeRADIUS is not active via systemctl. Testing configuration...'
        freeradius -CX || true
        nohup freeradius -X > /var/log/freeradius/radius_nohup.log 2>&1 &
        sleep 2
    else
        echo 'FreeRADIUS Service is ACTIVE and RUNNING.'
    fi

    echo '8. Restarting wipay-spa-backend (Port 5010) & wipay-backend (Port 5005)...'
    # Forcefully release ports 5010 and 5005 from any orphaned background processes
    fuser -k 5010/tcp 2>/dev/null || true
    fuser -k 5005/tcp 2>/dev/null || true
    lsof -t -i:5010 | xargs kill -9 2>/dev/null || true
    lsof -t -i:5005 | xargs kill -9 2>/dev/null || true

    if [ -d "/var/www/wipay-spa-server" ]; then
        cd /var/www/wipay-spa-server
        pm2 delete wipay-spa-backend 2>/dev/null || true
        PORT=5010 pm2 start server.js --name wipay-spa-backend
    fi

    if [ -d "/var/www/wipay-server" ]; then
        cd /var/www/wipay-server
        pm2 delete wipay-backend 2>/dev/null || true
        PORT=5005 pm2 start server.js --name wipay-backend
    fi

    # Automatically discover and start any background scripts located in /root
    for root_script in /root/*.js; do
        if [ -f "$root_script" ]; then
            script_name=$(basename "$root_script" .js)
            if [ "$script_name" != "server" ]; then
                echo "Starting root process: $script_name..."
                cd /root
                pm2 restart "$script_name" 2>/dev/null || pm2 start "$root_script" --name "$script_name" 2>/dev/null || true
            fi
        fi
    done
    pm2 save 2>/dev/null || true
    echo '=== PM2 PROCESS STATUS ==='
    pm2 status

    echo '9. Cleanup...'
    rm -rf /tmp/deploy.tar.gz /tmp/wipay_update

    echo 'Deployment Complete!'
'@

$cleanCommands = $remoteCommands.Replace("`r`n", "`n")

if ($KeyPath) {
    Write-Host "Uploading to ${Ip} (using key: ${KeyPath})..." -ForegroundColor Cyan
    scp -i $KeyPath deploy.tar.gz "${User}@${Ip}:/tmp/deploy.tar.gz"
    
    Write-Host "Deploying on Remote Server..." -ForegroundColor Cyan
    ssh -i $KeyPath "${User}@${Ip}" $cleanCommands
}
else {
    Write-Host "Uploading to ${Ip} (using default auth)..." -ForegroundColor Cyan
    scp deploy.tar.gz "${User}@${Ip}:/tmp/deploy.tar.gz"
    
    Write-Host "Deploying on Remote Server..." -ForegroundColor Cyan
    ssh "${User}@${Ip}" $cleanCommands
}

Write-Host "Done!" -ForegroundColor Green
Remove-Item "deploy.tar.gz" -ErrorAction SilentlyContinue
