#!/bin/bash

# fix_mikhmon_404.sh
# Run this on your VPS to repair Mikhmon isolation issues.

echo "--- 🛠️  WiPay Mikhmon Repair Tool ---"

# 1. Paths
MIKHMON_MASTER="/var/www/wipay-client/mikhmon_master"
MIKHMON_CLIENTS="/var/www/wipay-client/mikhmon"
SERVER_DIR="/var/www/wipay-server"

# 2. Ensure Master Folder is Populated
if [ ! -f "$MIKHMON_MASTER/index.php" ]; then
    echo "⚠️  Mikhmon Master is empty. Downloading template..."
    mkdir -p "$MIKHMON_MASTER"
    cd /tmp
    wget -O mikhmon.zip https://github.com/laksa19/mikhmonv3/archive/refs/heads/master.zip
    unzip -o mikhmon.zip
    cp -r mikhmonv3-master/* "$MIKHMON_MASTER/"
    rm -rf mikhmonv3-master mikhmon.zip
    echo "✅ Master populated."
else
    echo "✅ Master folder looks OK."
fi

# 3. Ensure Client Root exists
mkdir -p "$MIKHMON_CLIENTS"
chown www-data:www-data "$MIKHMON_CLIENTS"

# 4. Re-apply Nginx Snippet
echo "Checking Nginx configuration..."
SNIPPET="/etc/nginx/snippets/mikhmon_location.conf"
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PHP_SOCK_NAME=$(basename $PHP_SOCK)

mkdir -p /etc/nginx/snippets
cat <<EOF > $SNIPPET
# --- Isolated Mikhmon Configuration ---
location /mikhmon {
    root /var/www/wipay-client;
    index index.php;

    # Handle all PHP files under /mikhmon/
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/$PHP_SOCK_NAME;
        fastcgi_param SCRIPT_FILENAME \$request_filename;
    }
}
# --------------------------------------
EOF

nginx -t && systemctl reload nginx
echo "✅ Nginx snippet updated and reloaded."

# 5. Repair Existing Tenants
echo "Repairing existing tenant folders..."
# Look for admin usernames in the DB (or just scan existing folders)
# We can use the create_mikhmon_client.sh script for all existing folders to ensure symlinks are OK.
# BUT, we need the usernames. A simpler way is to re-run the isolation for any folder in /var/www/wipay-client/mikhmon
for dir in "$MIKHMON_CLIENTS"/*; do
    if [ -d "$dir" ]; then
        username=$(basename "$dir")
        echo "Updating $username..."
        bash "$SERVER_DIR/create_mikhmon_client.sh" "$username"
    fi
done

# 6. Permissions Final Sweep
chown -R www-data:www-data /var/www/wipay-client/mikhmon
chmod -R 755 /var/www/wipay-client/mikhmon

echo "--- ✅ Repair Complete! ---"
echo "Test a link: https://ugpay.tech/mikhmon/any_username/"
