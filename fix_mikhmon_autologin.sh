#!/bin/bash
# Mikhmon Auto-Login Repair (SAFE VERSION)
# This version only updates autologin.php and fixes permissions.
# It NEVER overwrites your include/config.php or settings/ folder.

echo "🔧 Starting Mikhmon Auto-Login Repair (Safe Version)..."

M_MASTER="/var/www/wipay-server/mikhmon_master"
M_DIR="/var/www/wipay-client/mikhmon"

# Ensure master autologin exists
if [ ! -f "$M_MASTER/autologin.php" ]; then
    echo "❌ Error: Master autologin.php not found at $M_MASTER"
    exit 1
fi

echo "🩹 Patching existing tenant folders..."
for dir in "$M_DIR"/*/; do
    tenant_dir=${dir%/}
    tenant=$(basename "$tenant_dir")
    
    # Skip system folders
    if [[ "$tenant" =~ ^(include|css|js|img|settings)$ ]]; then
        continue
    fi

    echo "   - Repairing $tenant..."
    
    # 1. Update ONLY the autologin.php bridge
    cp "$M_MASTER/autologin.php" "$dir/autologin.php"
    
    # 2. Ensure basic data folders exist (don't wipe them!)
    mkdir -p "$dir/include/tmp"
    mkdir -p "$dir/settings"
    
    # 3. Fix Permissions
    chmod 777 "$dir/include/tmp"
    chmod 777 "$dir/settings"
    chmod 755 "$dir/autologin.php"
    
    # If config exists, make it writable for Mikhmon but keep it
    if [ -f "$dir/include/config.php" ]; then
        chmod 666 "$dir/include/config.php"
    fi

    chown -R www-data:www-data "$dir"
done

echo "🚀 Restarting API Server..."
pm2 restart wipay-backend || true

echo "✨ Repair Complete! Please testing auto-login."
echo "⚠️ Note: If you see the 'Select Router' list, please re-add your router manually once."
