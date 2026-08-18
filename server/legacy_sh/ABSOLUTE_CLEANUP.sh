#!/bin/bash

# ABSOLUTE_CLEANUP.sh
# 1. Cleans the messy /mikhmon/ folder (Removes master files from root)
# 2. Fixes Nginx "ugpay.tech" conflicts by disabling other sites.
# 3. Synchronizes all tenant folders from the database.

echo "--- 🧹 ABSOLUTE SYSTEM CLEANUP ---"

# 1. Nginx Conflict Cleanup
echo "Cleaning Nginx conflicts..."
# Detect if there are other files in sites-enabled targeting ugpay.tech
grep -r "ugpay.tech" /etc/nginx/sites-enabled/ | grep -v "default" | cut -d: -f1 | sort -u | while read -r extra_conf; do
    echo "⚠️  Found conflicting config: $extra_conf. Disabling it."
    rm "$extra_conf"
done

# 2. Mikhmon Root Cleanup
# The diagnostic showed master files in /var/www/wipay-client/mikhmon/ (LICENSE, index.php, etc.)
# We only want SUBS in there.
M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"

echo "Reorganizing Mikhmon root..."
# Temporarily move subs, delete mess, move subs back
mkdir -p /tmp/mikhmon_subs
mv "$M_ROOT"/*/ /tmp/mikhmon_subs/ 2>/dev/null
rm -rf "${M_ROOT:?}"/*
mv /tmp/mikhmon_subs/* "$M_ROOT/" 2>/dev/null
rm -rf /tmp/mikhmon_subs

# 3. Resync from Database (using raw mysql command)
echo "Resyncing tenants from DB..."
ENV_FILE="/var/www/wipay-server/.env"
DB_USER=$(grep DB_USER $ENV_FILE | cut -d'=' -f2)
DB_PASS=$(grep DB_PASSWORD $ENV_FILE | cut -d'=' -f2)
DB_NAME=$(grep DB_NAME $ENV_FILE | cut -d'=' -f2)

usernames=$(mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -s -e "SELECT username FROM admins WHERE role='admin'")

for u in $usernames; do
    safe_u=$(echo "$u" | tr ' ' '_')
    dest="$M_ROOT/$safe_u"
    echo "Checking $safe_u..."
    mkdir -p "$dest"
    
    # Symlinks
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Launcher
    cp -u "$MASTER/index.php" "$dest/index.php"
    mkdir -p "$dest/config" "$dest/inc/tmp"
done

# 4. Final Nginx Check
echo "Finalizing Nginx..."
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

# Ensure 'default' includes the snippet once
CONF="/etc/nginx/sites-enabled/default"
sed -i '/mikhmon_isolation/d' $CONF
LAST_BRACE=$(grep -n "}" $CONF | tail -n 1 | cut -d: -f1)
sed -i "${LAST_BRACE}i\    include snippets/mikhmon_isolation.conf;" $CONF

# 5. Reload
chown -R www-data:www-data "$M_ROOT"
chmod -R 755 "$M_ROOT"
nginx -t && systemctl reload nginx

echo "--- ✅ SYSTEM CLEANED AND REPAIRED ---"
ls -F "$M_ROOT"
