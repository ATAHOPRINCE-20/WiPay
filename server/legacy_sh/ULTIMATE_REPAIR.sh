#!/bin/bash

# ULTIMATE_REPAIR.sh
# Fixes: Mikhmon 404s, Port Mismatches (3000 vs 5002), and Permissions.

echo "--- 🛠️  ULTIMATE SYSTEM REPAIR ---"

# 1. Load config from .env
ENV_FILE="/var/www/wipay-server/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env not found at $ENV_FILE"
    exit 1
fi

DB_USER=$(grep DB_USER $ENV_FILE | cut -d'=' -f2)
DB_PASS=$(grep DB_PASSWORD $ENV_FILE | cut -d'=' -f2)
DB_NAME=$(grep DB_NAME $ENV_FILE | cut -d'=' -f2)
APP_PORT=$(grep PORT $ENV_FILE | cut -d'=' -f2)
APP_PORT=${APP_PORT:-5002}

echo "Config: Port=$APP_PORT, DB=$DB_NAME"

# 2. Fix Nginx Port & Correct Upstream (IPv4 focus)
echo "Fixing Nginx config..."
NGINX_CONF="/etc/nginx/sites-enabled/default"
cp $NGINX_CONF "${NGINX_CONF}.ultimate.bak"

# Replace localhost or [::1] with 127.0.0.1 and ensure the port matches .env
# This specifically fixes the "Connection refused" to [::1]:3000
sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" $NGINX_CONF
sed -i "s|proxy_pass http://\[::1\]:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" $NGINX_CONF

# 3. Clean and Re-apply Mikhmon Snippet
SNIPPET="/etc/nginx/snippets/mikhmon_isolation.conf"
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PHP_SOCK_NAME=$(basename $PHP_SOCK)

mkdir -p /etc/nginx/snippets
cat <<EOF > $SNIPPET
location /mikhmon/ {
    root /var/www/wipay-client;
    index index.php;
    try_files \$uri \$uri/ =404;

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/$PHP_SOCK_NAME;
        fastcgi_param SCRIPT_FILENAME \$request_filename;
    }
}
EOF

# 4. Provision ALL Mikhmon folders from Database
echo "Provisioning Mikhmon for all tenants..."
MIKHMON_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"
mkdir -p "$MIKHMON_ROOT"

# Get all usernames from SQL
USERNAMES=$(mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "SELECT username FROM admins")

for username in $USERNAMES; do
    safe_user=$(echo "$username" | tr ' ' '_')
    dest="$MIKHMON_ROOT/$safe_user"
    echo "Ensuring folder for: $safe_user"
    mkdir -p "$dest"
    
    # Symlink core folders
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Copy index.php
    if [ ! -f "$dest/index.php" ]; then
        cp "$MASTER/index.php" "$dest/index.php"
    fi
    # Private config folder
    mkdir -p "$dest/config"
    mkdir -p "$dest/inc/tmp"
done

# 5. Permissions
echo "Setting permissions..."
chown -R www-data:www-data /var/www/wipay-client/mikhmon
chmod -R 755 /var/www/wipay-client/mikhmon

# 6. Apply Nginx changes
nginx -t && systemctl reload nginx

echo "--- ✅ SYSTEM REPAIRED ---"
echo "API should be on: 127.0.0.1:$APP_PORT"
echo "Mikhmon folders created for: $USERNAMES"
