#!/bin/bash

# FINAL_DIAGNOSTIC_AND_FIX.sh
# This script will SHOW us exactly what is wrong and then fix it.

echo "--- 🔍 SYSTEM DIAGNOSIS ---"

# 1. Check Directory Structure
echo "Listing /var/www/wipay-client/mikhmon contents:"
ls -F /var/www/wipay-client/mikhmon

echo "Listing /var/www/wipay-client/mikhmon_master contents:"
ls -F /var/www/wipay-client/mikhmon_master

# 2. Check Nginx Correctness
echo "Verifying Nginx Snippet Content:"
cat /etc/nginx/snippets/mikhmon_isolation.conf

# 3. Detect PHP Socket (Correctly)
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
echo "PHP Socket Found: $PHP_SOCK"

# 4. FIXING - Using a safer loop for usernames
echo "--- 🛠️  STARTING FINAL REPAIR ---"

# Use a Node.js script to get usernames reliably
cat <<EOF > /tmp/get_usernames.js
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '/var/www/wipay-server/.env' });

async function run() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    const [rows] = await db.query('SELECT username FROM admins');
    rows.forEach(r => console.log(r.username));
    await db.end();
}
run().catch(err => { console.error(err); process.exit(1); });
EOF

# Ensure mysql2 is available in the server dir
cd /var/www/wipay-server

MASTER="/var/www/wipay-client/mikhmon_master"
M_ROOT="/var/www/wipay-client/mikhmon"
mkdir -p "$M_ROOT"

node /tmp/get_usernames.js | while read -r username; do
    # Normalize username: replace spaces with underscores to match Dashboard links
    safe_user=$(echo "$username" | sed 's/ /_/g')
    dest="$M_ROOT/$safe_user"
    
    echo "Processing Tenant: $username -> Folder: $safe_user"
    mkdir -p "$dest"
    
    # Symlinks
    ln -snf "$MASTER/assets" "$dest/assets"
    ln -snf "$MASTER/css" "$dest/css"
    ln -snf "$MASTER/inc" "$dest/inc"
    ln -snf "$MASTER/img" "$dest/img"
    ln -snf "$MASTER/js" "$dest/js"
    
    # Core Files
    cp -u "$MASTER/index.php" "$dest/index.php" 2>/dev/null
    mkdir -p "$dest/config" "$dest/inc/tmp"
done

# 5. Fix Nginx include in case it's missing or duplicate
echo "Finalizing Nginx..."
CONF="/etc/nginx/sites-enabled/default"
# Remove old references to avoid duplicates
sed -i '/mikhmon_isolation/d' $CONF
sed -i '/mikhmon_location/d' $CONF

# Inject include at the bottom
BRACE_LINE=$(grep -n "}" $CONF | tail -n 1 | cut -d: -f1)
sed -i "${BRACE_LINE}i\    include snippets/mikhmon_isolation.conf;" $CONF

# 6. Permissions
chown -R www-data:www-data /var/www/wipay-client/mikhmon
chmod -R 755 /var/www/wipay-client/mikhmon

nginx -t && systemctl reload nginx
echo "--- ✅ DONE ---"
