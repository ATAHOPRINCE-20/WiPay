#!/bin/bash

# create_mikhmon_client.sh
# Robust script to create an isolated Mikhmon instance for a specific client.

CLIENT_NAME=$1
M_ROOT="/var/www/wipay-client/mikhmon"
MASTER="/var/www/wipay-client/mikhmon_master"

if [ -z "$CLIENT_NAME" ]; then
    echo "Usage: $0 <client_name>"
    exit 1
fi

echo "Creating Isolated Mikhmon for: $CLIENT_NAME..."
DEST="$M_ROOT/$CLIENT_NAME"

# 1. Create Directory
mkdir -p "$DEST"

# 2. FULL COPY (Stability First)
cp -r "$MASTER"/* "$DEST/"
echo "📂 Copied all files from master"

# 3. Clean and fix data folders
rm -rf "$DEST/include/tmp"/* 2>/dev/null
mkdir -p "$DEST/include/tmp"
chmod 777 "$DEST/include/tmp"
chmod 777 "$DEST/settings"
echo "🔑 Fixed permissions for data folders"

# 4. Permissions
chown -R www-data:www-data "$DEST"
chmod -R 755 "$DEST"
chmod -R 777 "$DEST/include/tmp"
chmod -R 777 "$DEST/settings"

echo "✅ Isolation Complete for $CLIENT_NAME"
echo "URL: https://ugpay.tech/mikhmon/$CLIENT_NAME/"
