#!/bin/bash

# FIX_AND_RESTORE.sh
# 1. Re-enables the default Nginx site.
# 2. Fixes the Space Bug for Mikhmon folders (ATAHO_PRINCE instead of ATAHO and PRINCE).
# 3. Synchronizes ports and avoids IPv6 Connection Refused.

echo "--- 🛠️  SYSTEM RESTORE & FINAL FIX ---"

ENV_FILE="/var/www/wipay-server/.env"
APP_PORT=$(grep ^PORT= "$ENV_FILE" | cut -d'=' -f2)
APP_PORT=${APP_PORT:-5002}

# --- STEP 1: RESTORE NGINX ---
echo "Step 1: Restoring Nginx..."
AVAILABLE="/etc/nginx/sites-available/default"
ENABLED="/etc/nginx/sites-enabled/default"

# Force re-enable default
ln -snf "$AVAILABLE" "$ENABLED"

# Remove the broken backups from enabled if they exist
rm -f /etc/nginx/sites-enabled/*.bak
rm -f /etc/nginx/sites-enabled/*.ultimate
rm -f /etc/nginx/sites-enabled/*.nuke

# Fix the internal Proxy to 127.0.0.1 (Avoid IPv6 [::1])
sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
sed -i "s|proxy_pass http://\[::1\]:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"

# --- STEP 2: FIX MIKHMON SPACES ---
echo "Step 2: Fixing Mikhmon Folders..."
M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"

# Clean the mess
mkdir -p /tmp/mikhmon_rescue
mv "$M_ROOT"/* /tmp/mikhmon_rescue/ 2>/dev/null
rm -rf "$M_ROOT"/*

# Fetch names correctly preserving spaces
DB_USER=$(grep DB_USER $ENV_FILE | cut -d'=' -f2)
DB_PASS=$(grep DB_PASSWORD $ENV_FILE | cut -d'=' -f2)
DB_NAME=$(grep DB_NAME $ENV_FILE | cut -d'=' -f2)

# Use -N -s and a while read loop to handle spaces
mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -N -s -e "SELECT username FROM admins WHERE role='admin'" | while read -r username; do
    # Dashboard uses underscores for spaces: ATAHO PRINCE -> ATAHO_PRINCE
    safe_user=$(echo "$username" | sed 's/ /_/g')
    dest="$M_ROOT/$safe_user"
    
    echo "✅ Creating folder for: '$username' -> $safe_user"
    mkdir -p "$dest"
    
    # Symlinks
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Files
    cp -u "$MASTER/index.php" "$dest/index.php"
    mkdir -p "$dest/config" "$dest/inc/tmp"
done

# --- STEP 3: NGINX CONFIG ---
echo "Step 3: Applying Nginx Settings..."
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
SNIPPET="/etc/nginx/snippets/mikhmon_isolation.conf"

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

# Ensure 'default' includes the snippet
sed -i '/mikhmon_isolation/d' "$AVAILABLE"
LAST_BRACE=$(grep -n "}" "$AVAILABLE" | tail -n 1 | cut -d: -f4) # We'll append before last brace
# More reliable append for 'default'
sed -i "/^}/i \    include snippets/mikhmon_isolation.conf;" "$AVAILABLE"

# Restart
chown -R www-data:www-data "$M_ROOT"
chmod -R 755 "$M_ROOT"
nginx -t && systemctl restart nginx

echo "--- ✅ REPAIR COMPLETE ---"
ls -F "$M_ROOT"
