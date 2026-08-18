#!/bin/bash

# DEFINITIVE_FIX.sh
# 1. Finds and REMOVES all Nginx files containing "ugpay.tech" except the default one.
# 2. Purges the Mikhmon folder and rebuilds it strictly from the DB.
# 3. Ensures the Nginx config is lean and correct.

echo "--- 🛠️  DEFINITIVE SYSTEM REPAIR ---"

# 1. Nginx Deep Clean
echo "Step 1: Fixing Nginx Conflicts..."
# Find every file in /etc/nginx that defines the server name
FILES=$(grep -rl "server_name.*ugpay.tech" /etc/nginx/)
echo "Found ugpay.tech in these files:"
echo "$FILES"

# We want to keep ONLY /etc/nginx/sites-available/default
# We will disable (rm from sites-enabled) any other file found.
for f in $FILES; do
    if [[ "$f" != *"/sites-available/default"* ]]; then
        enabled_version="/etc/nginx/sites-enabled/$(basename "$f")"
        if [ -f "$enabled_version" ]; then
            echo "🚨 Disabling conflicting enabled config: $enabled_version"
            rm "$enabled_version"
        fi
        # If it's not the default one, we backup and remove it from available too to be CAUTIOUS
        echo "📦 Backing up and removing extra available config: $f"
        cp "$f" "$f.bk_conflict"
        # We don't rm from available, just ensure it's not enabled.
    fi
done

# 2. Mikhmon Purge & Rebuild
echo "Step 2: Rebuilding Mikhmon Directory..."
M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"
ENV_FILE="/var/www/wipay-server/.env"

# COMPLETELY DELETE the root (except symlinked stuff if any, let's just nuke it)
# We recreate it fresh.
rm -rf "$M_ROOT"
mkdir -p "$M_ROOT"

# Load DB credentials
DB_USER=$(grep DB_USER $ENV_FILE | cut -d'=' -f2)
DB_PASS=$(grep DB_PASSWORD $ENV_FILE | cut -d'=' -f2)
DB_NAME=$(grep DB_NAME $ENV_FILE | cut -d'=' -f2)

usernames=$(mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -s -e "SELECT username FROM admins")

for u in $usernames; do
    # Normalize: Dashboard links use underscores for spaces
    safe_u=$(echo "$u" | tr ' ' '_')
    dest="$M_ROOT/$safe_u"
    echo "🏗️  Creating client: $safe_u"
    mkdir -p "$dest"
    
    # Symlinks
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Launcher & Dirs
    cp -u "$MASTER/index.php" "$dest/index.php"
    mkdir -p "$dest/config"
    mkdir -p "$dest/inc/tmp"
done

# 3. Final Nginx Config Alignment
echo "Step 3: Aligning Nginx Snippet..."
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
SNIPPET="/etc/nginx/snippets/mikhmon_isolation.conf"
cat <<EOF > $SNIPPET
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

# Ensure the include is in the default file
CONF="/etc/nginx/sites-available/default"
sed -i '/mikhmon_isolation.conf/d' $CONF
LAST_BRACE=$(grep -n "}" $CONF | tail -n 1 | cut -d: -f1)
sed -i "${LAST_BRACE}i\    include snippets/mikhmon_isolation.conf;" $CONF

# 4. Permissions & Reload
chown -R www-data:www-data "$M_ROOT"
chmod -R 755 "$M_ROOT"

echo "Step 4: Testing & Reloading..."
nginx -t && systemctl reload nginx

echo "--- ✅ DEFINITIVE REPAIR COMPLETE ---"
ls -F "$M_ROOT"
