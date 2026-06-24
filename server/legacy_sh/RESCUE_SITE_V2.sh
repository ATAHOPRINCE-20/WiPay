#!/bin/bash

# RESCUE_SITE_V2.sh
# Fixes: Duplicate Location error, Site Down, Port Mismatch.

echo "--- 🚑 EMERGENCY SITE RESCUE V2 ---"

AVAILABLE="/etc/nginx/sites-available/default"
ENABLED="/etc/nginx/sites-enabled/default"

# 1. Deep Clean Nginx Default Config
echo "Step 1: Cleaning Nginx default config..."
if [ -f "$AVAILABLE" ]; then
    # Create a fresh backup
    cp "$AVAILABLE" "${AVAILABLE}.v2.bak"
    
    # 1.1 Remove any hardcoded location /mikhmon blocks (aggressive multiline delete)
    # This deletes everything from 'location /mikhmon' until the next closing brace '}'
    sed -i '/location \/mikhmon/,/}/d' "$AVAILABLE"
    
    # 1.2 Remove any existing snippet includes
    sed -i '/mikhmon_isolation.conf/d' "$AVAILABLE"
    sed -i '/mikhmon_location.conf/d' "$AVAILABLE"
    
    # 1.3 Fix the Port and IP (Prevent [::1] connection issues)
    ENV_FILE="/var/www/wipay-server/.env"
    APP_PORT=$(grep ^PORT= "$ENV_FILE" | cut -d'=' -f2)
    APP_PORT=${APP_PORT:-5002}
    
    sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
    sed -i "s|proxy_pass http://\[::1\]:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
    sed -i "s|proxy_pass http://127.0.0.1:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
    
    # 1.4 Re-inject the include AT THE BOTTOM (before the last brace)
    LAST_BRACE=$(grep -n "}" "$AVAILABLE" | tail -n 1 | cut -d: -f1)
    if [ ! -z "$LAST_BRACE" ]; then
        sed -i "${LAST_BRACE}i\    include snippets/mikhmon_isolation.conf;" "$AVAILABLE"
        echo "✅ Snippet include re-injected."
    fi
else
    echo "❌ Error: $AVAILABLE not found!"
    exit 1
fi

# 2. Fix the symlink
ln -snf "$AVAILABLE" "$ENABLED"

# 3. Test and Restart
echo "Step 3: Restarting Nginx..."
nginx -t
if [ $? -eq 0 ]; then
    systemctl restart nginx
    echo "✅ Nginx is UP."
else
    echo "❌ Nginx test failed! Manual intervention needed or check /etc/nginx/sites-enabled for other files."
    # List other enabled files to help debug
    ls -l /etc/nginx/sites-enabled
fi

echo "--- ✅ RESCUE V2 COMPLETE ---"
