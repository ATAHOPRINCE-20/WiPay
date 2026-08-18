#!/bin/bash

# NUCLEAR_MIKHMON_FIX.sh
# The ultimate repair script for WiPay Mikhmon Isolation.
# This script is designed to handle every edge case encountered so far.

LOG_FILE="/var/www/wipay-server/nuclear_repair.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "--- ☢️  MIKHMON NUCLEAR REPAIR INITIATED [$(date)] ---"

# 0. DATABASE MIGRATION (Mikhmon Auto-login Tokens)
echo "📂 Ensuring Mikhmon Auto-Login table exists..."
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
CREATE TABLE IF NOT EXISTS mikhmon_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    token VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (token),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);" 2>/dev/null

# 1. LOAD & CLEAN ENVIRONMENT
ENV_FILE="/var/www/wipay-server/.env"

# 0. DE-TOXIFY WIREGUARD
WG_CONF="/etc/wireguard/wg0.conf"
if [ -f "$WG_CONF" ]; then
    echo "🛡️ Fixing WireGuard Config (Removing SaveConfig)..."
    sed -i '/SaveConfig = true/d' "$WG_CONF"
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Clean helper to strip quotes and spaces
get_env() {
    grep "^$1=" "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//"
}

DB_USER=$(get_env DB_USER)
DB_PASS=$(get_env DB_PASSWORD)
DB_NAME=$(get_env DB_NAME)
APP_PORT=$(get_env PORT)
APP_PORT=${APP_PORT:-5002}

echo "✅ Environment loaded (DB: $DB_NAME, Port: $APP_PORT)"

# 2. POPULATE MASTER
MASTER="/var/www/wipay-client/mikhmon_master"
mkdir -p "$MASTER"

if [ ! -f "$MASTER/index.php" ] || [ ! -d "$MASTER/inc" ]; then
    echo "📦 Master is incomplete. Re-downloading from source..."
    TMP_DIR="/tmp/mikhmon_download"
    mkdir -p "$TMP_DIR"
    cd "$TMP_DIR"
    wget -O mikhmon.zip https://github.com/laksa19/mikhmonv3/archive/refs/heads/master.zip
    unzip -o mikhmon.zip
    cp -r mikhmonv3-master/* "$MASTER/"
    rm -rf "$TMP_DIR"
    echo "✅ Master populated."
else
    echo "✅ Master populated."
fi

# 3.5 CLEAN MASTER SESSIONS
echo "🧹 Cleaning Master Sessions..."
rm -rf "$MASTER/include/tmp"/* 2>/dev/null
mkdir -p "$MASTER/include/tmp"

# 3. IDENTIFY PHP
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
if [ -z "$PHP_SOCK" ]; then
    echo "❌ CRITICAL: No PHP-FPM socket found in /run/php/"
    echo "Trying to find any fpm socket..."
    PHP_SOCK=$(find /run -name "*fpm.sock" | head -n 1)
fi

if [ -z "$PHP_SOCK" ]; then
    echo "❌ FATAL: Could not find PHP-FPM socket. Is PHP-FPM installed?"
    exit 1
fi
echo "✅ Using PHP Socket: $PHP_SOCK"

# 4. REBUILD TENANTS
M_ROOT="/var/www/wipay-client/mikhmon"
mkdir -p "$M_ROOT"

echo "🧹 Clearing old structure (Moving to /tmp/mikhmon_vault)..."
mkdir -p /tmp/mikhmon_vault
mv "$M_ROOT"/* /tmp/mikhmon_vault/ 2>/dev/null
rm -rf "$M_ROOT"/*

echo "🏗️  Rebuilding tenant folders..."
# We use a robust SQL call and handle spaces correctly
QUERY="SELECT username FROM admins WHERE role='admin'"
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -s -e "$QUERY" | while read -r username; do
    if [ -z "$username" ]; then continue; fi
    
    # Standardize name: spaces -> single underscore, trim whitespace
    safe_user=$(echo "$username" | xargs | sed 's/[[:space:]]\+/_/g')
    dest="$M_ROOT/$safe_user"
    
    echo "👤 Tenant: '$username' -> $safe_user"
    # --- FULL ISOLATION LOGIC (Copy Everything) ---
    mkdir -p "$dest"
    cp -r "$MASTER"/* "$dest/"
    
    # 2. RESTORE SETTINGS (Smart Vault Recovery)
    # Check for underscore name AND space name in vault
    OLD_NAME_SPACE=$(echo "$username" | xargs)
    
    if [ -d "/tmp/mikhmon_vault/$safe_user/settings" ]; then
        VAULT_PATH="/tmp/mikhmon_vault/$safe_user"
    elif [ -d "/tmp/mikhmon_vault/$OLD_NAME_SPACE/settings" ]; then
        VAULT_PATH="/tmp/mikhmon_vault/$OLD_NAME_SPACE"
    else
        VAULT_PATH=""
    fi

    if [ ! -z "$VAULT_PATH" ]; then
        echo "♻️ Restored data from vault: $VAULT_PATH"
        rm -rf "$dest/settings" "$dest/config"
        cp -r "$VAULT_PATH/settings" "$dest/" 2>/dev/null
        cp -r "$VAULT_PATH/config" "$dest/" 2>/dev/null
    else
        echo "⚠️ No vault data found for '$username'"
    fi

    # 3. Clean and fix session folder
    mkdir -p "$dest/include/tmp"
    rm -rf "$dest/include/tmp"/* 2>/dev/null
    
    # 4. BROAD PERMISSIONS (Force success)
    chmod -R 777 "$dest/include/tmp"
    chmod -R 777 "$dest/settings"
    chmod 644 "$dest/autologin.php"
done

# 5. CONFIGURE NGINX SNIPPET
SNIPPET_FILE="/etc/nginx/snippets/mikhmon_isolation.conf"
mkdir -p /etc/nginx/snippets

cat <<EOF > "$SNIPPET_FILE"
# --- Nuclear Mikhmon Isolation ---
location /mikhmon {
    # Redirection for missing trailing slash
    rewrite ^/mikhmon$ /mikhmon/ permanent;
    
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
}
# --------------------------------
EOF

# 6. APPLY TO NGINX DEFAULT
AVAILABLE_DEFAULT="/etc/nginx/sites-available/default"
ENABLED_DEFAULT="/etc/nginx/sites-enabled/default"

# Ensure 'default' is enabled
if [ ! -L "$ENABLED_DEFAULT" ]; then
    ln -snf "$AVAILABLE_DEFAULT" "$ENABLED_DEFAULT"
fi

# Clean up old includes
sed -i '/mikhmon_isolation/d' "$AVAILABLE_DEFAULT"
sed -i '/mikhmon_location/d' "$AVAILABLE_DEFAULT"

# Insert the include BEFORE the last closing brace of the server block
# This is usually the end of the file.
LAST_BRACE=$(grep -n "}" "$AVAILABLE_DEFAULT" | tail -n 1 | cut -d: -f1)
if [ ! -z "$LAST_BRACE" ]; then
    sed -i "${LAST_BRACE}i\    include snippets/mikhmon_isolation.conf;" "$AVAILABLE_DEFAULT"
    echo "✅ Snippet included in $AVAILABLE_DEFAULT"
else
    echo "include snippets/mikhmon_isolation.conf;" >> "$AVAILABLE_DEFAULT"
    echo "⚠️ Warning: Could not find closing brace. Appending to end of file."
fi

# 7. PERMISSIONS & RESTART
echo "🔑 Setting permissions..."
chown -R www-data:www-data "$M_ROOT"
chown -R www-data:www-data "$MASTER"
chmod -R 755 "$M_ROOT"
chmod -R 755 "$MASTER"

echo "🔄 Restarting Nginx & WireGuard..."
nginx -t && systemctl restart nginx
wg-quick down wg0 2>/dev/null; wg-quick up wg0 2>/dev/null
echo "✅ VPN Restored"

echo "--- ✅ NUCLEAR REPAIR COMPLETE ---"
echo "Check your site: https://ugpay.tech/mikhmon/any_username/"
echo "Check log at: $LOG_FILE"
