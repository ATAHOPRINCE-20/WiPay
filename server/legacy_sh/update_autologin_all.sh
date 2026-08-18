#!/bin/bash

# update_autologin_all.sh
# Efficiently updates the autologin.php bridge for all existing Mikhmon clients.

M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"

echo "--- 🔄 WiPay Auto-Login Update Tool ---"

if [ ! -f "$MASTER/autologin.php" ]; then
    echo "❌ Error: $MASTER/autologin.php not found."
    exit 1
fi

echo "Updating existing tenants..."
for dir in "$M_ROOT"/*; do
    if [ -d "$dir" ]; then
        username=$(basename "$dir")
        echo "Updating $username..."
        cp "$MASTER/autologin.php" "$dir/autologin.php"
        chown www-data:www-data "$dir/autologin.php"
        chmod 644 "$dir/autologin.php"
    fi
done

echo "✅ All autologin.php files updated successfully."
