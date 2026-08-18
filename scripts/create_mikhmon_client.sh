#!/bin/bash

# WiPay Mikhmon Client Generator
# Usage: ./create_client.sh [client_name]
# Example: ./create_client.sh shop1

CLIENT_NAME=$1

# 1. Check if name is provided
if [ -z "$CLIENT_NAME" ]; then
    echo "❌ Error: Please provide a client name."
    echo "Usage: ./create_client.sh [client_name]"
    exit 1
fi

# 2. Define Paths
SOURCE_DIR="/var/www/html/mikhmon"
TARGET_DIR="/var/www/html/$CLIENT_NAME"

# 3. Check if Client already exists
if [ -d "$TARGET_DIR" ]; then
    echo "❌ Error: Client '$CLIENT_NAME' already exists!"
    exit 1
fi

# 4. Check if Source (Master Mikhmon) exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Error: Master Mikhmon folder not found at $SOURCE_DIR"
    echo "Please install Mikhmon in $SOURCE_DIR first."
    exit 1
fi

echo "🚀 Creating Mikhmon instance for: $CLIENT_NAME"

# 5. Copy Files
cp -r "$SOURCE_DIR" "$TARGET_DIR"

# 6. Set Permissions (Make sure web server owns it)
chown -R www-data:www-data "$TARGET_DIR"
chmod -R 755 "$TARGET_DIR"

# 7. Success Message
echo "=================================================="
echo "✅ SUCCESS!"
echo "Client Created: $CLIENT_NAME"
echo "URL: https://ugpay.tech/$CLIENT_NAME/"
echo "Default Login: mikhmon / 1234"
echo "=================================================="
