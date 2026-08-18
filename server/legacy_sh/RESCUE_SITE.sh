#!/bin/bash

# RESCUE_SITE.sh
# Fixes: Site Down, Port Mismatch, Connection Refused.

echo "--- 🚑 EMERGENCY SITE RESCUE ---"

# 1. Restore Nginx Link
echo "Step 1: Restoring Nginx Symlink..."
AVAILABLE="/etc/nginx/sites-available/default"
ENABLED="/etc/nginx/sites-enabled/default"

if [ -f "$AVAILABLE" ]; then
    ln -snf "$AVAILABLE" "$ENABLED"
    echo "✅ Default site re-enabled."
else
    echo "❌ Error: /etc/nginx/sites-available/default not found!"
    exit 1
fi

# 2. Synchronize Ports
echo "Step 2: Synchronizing Ports..."
ENV_FILE="/var/www/wipay-server/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env not found!"
    exit 1
fi

# Get port from .env (e.g., 3000 or 5002)
APP_PORT=$(grep ^PORT= "$ENV_FILE" | cut -d'=' -f2)
APP_PORT=${APP_PORT:-5002}
echo "Target Port: $APP_PORT"

# Ensure Nginx points to exactly this port on 127.0.0.1
# This replaces any proxy_pass inside the default file
sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
sed -i "s|proxy_pass http://\[::1\]:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"
sed -i "s|proxy_pass http://127.0.0.1:[0-9]*|proxy_pass http://127.0.0.1:$APP_PORT|g" "$AVAILABLE"

# 3. Restart Services
echo "Step 3: Restarting Services..."
# Restart Nginx
nginx -t && systemctl reload nginx || systemctl restart nginx
echo "✅ Nginx reloaded."

# Restart Node Application
cd /var/www/wipay-server
if command -v pm2 &> /dev/null; then
    pm2 restart all || pm2 start server.js
    echo "✅ PM2 restarted."
else
    # Fallback if no PM2
    pkill node
    nohup node server.js > out.log 2>&1 &
    echo "✅ Node process restarted in background."
fi

# 4. Final Verification
echo "--- ✅ RESCUE COMPLETE ---"
echo "API should be listening on port $APP_PORT"
echo "Nginx is now proxying to 127.0.0.1:$APP_PORT"
netstat -tulpn | grep :$APP_PORT
