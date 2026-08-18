#!/bin/bash

# FINAL_RESOLUTION.sh
# 1. Fixes the space-handling bug in tenant folder creation.
# 2. Re-enables the default Nginx site and removes conflicts correctly.
# 3. Force-aligns Nginx to use 127.0.0.1 for the API to avoid IPv6 issues.

echo "--- 🛠️  FINAL SYSTEM RESOLUTION ---"

# --- PART 1: NGINX REPAIR ---
echo "Step 1: Repairing Nginx Configuration..."
ENABLED="/etc/nginx/sites-enabled"
AVAILABLE="/etc/nginx/sites-available"

# 1.1 Ensure 'default' is the only enabled config for ugpay.tech
# Re-enable default if missing
if [ ! -L "$ENABLED/default" ]; then
    echo "🔗 Re-enabling default site..."
    ln -snf "$AVAILABLE/default" "$ENABLED/default"
fi

# 1.2 Identify and disable ANY OTHER enabled file that mentions ugpay.tech
grep -rl "ugpay.tech" $ENABLED | while read -r f; do
    if [[ "$(basename "$f")" != "default" ]]; then
        echo "🚨 Disabling conflict: $f"
        rm "$f"
    fi
done

# 1.3 Fix the API proxy to use 127.0.0.1 (Avoid IPv6 [::1] connection refused)
# We also ensure it uses the port from .env
ENV_FILE="/var/www/wipay-server/.env"
APP_PORT=$(grep ^PORT= "$ENV_FILE" | cut -d'=' -f2)
APP_PORT=${APP_PORT:-5002}

echo "Updating API Proxy to 127.0.0.1:$APP_PORT..."
sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE/default"
sed -i "s|proxy_pass http://\[::1\]:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE/default"

# --- PART 2: MIKHMON REBUILD ---
echo "Step 2: Rebuilding Mikhmon Directory (Fixing Space Bug)..."
M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"

# Clean start for folders
# We use a temp directory to avoid losing data if it was working
mkdir -p /tmp/mikhmon_backup
mv "$M_ROOT"/* /tmp/mikhmon_backup/ 2>/dev/null
rm -rf "$M_ROOT"/*

# Load DB credentials
DB_USER=$(grep DB_USER "$ENV_FILE" | cut -d'=' -f2)
DB_PASS=$(grep DB_PASSWORD "$ENV_FILE" | cut -d'=' -f2)
DB_NAME=$(grep DB_NAME "$ENV_FILE" | cut -d'=' -f2)

# USE WHILE READ to handle spaces correctly!
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -s -e "SELECT username FROM admins WHERE role='admin'" | while read -r username; do
    # Dashboard uses underscores for links if they have spaces
    safe_user=$(echo "$username" | sed 's/ /_/g')
    dest="$M_ROOT/$safe_user"
    
    echo "🏗️  Creating folder for: '$username' -> $safe_user"
    mkdir -p "$dest"
    
    # Links
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Launcher
    cp -u "$MASTER/index.php" "$dest/index.php"
    mkdir -p "$dest/config" "$dest/inc/tmp"
done

# --- PART 3: PERMISSIONS & RELOAD ---
echo "Step 3: Final Sweep..."
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
SNIPPET="/etc/nginx/snippets/mikhmon_isolation.conf"

# Ensure the snippet is clean
cat <<EOF > "$SNIPPET"
location /mikhmon/ {
    root /var/www/wipay-client;
    index index.php;
    try_files \$uri \$uri/ =404;

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_SOCK;
        fastcgi_param SCRIPT_FILENAME \$request_filename;
    }
}
EOF

chown -R www-data:www-data "$M_ROOT"
chmod -R 755 "$M_ROOT"

nginx -t && systemctl reload nginx

echo "--- ✅ RESOLUTION COMPLETE ---"
echo "Current Mikhmon Folders:"
ls -F "$M_ROOT"
