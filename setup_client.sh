#!/bin/bash

# Usage: ./setup_client.sh <client_name> <port>
# Example: ./setup_client.sh hotel_a 8081

CLIENT=$1
PORT=$2

if [ -z "$CLIENT" ] || [ -z "$PORT" ]; then
    echo "Usage: ./setup_client.sh <client_name> <port>"
    exit 1
fi

echo "--- Client Deployment Started ---"
echo "Client: $CLIENT"
echo "Port: $PORT"

# 1. Image Check & Pull
IMAGE="mrizalhp/mikhmonv3"
echo "Pulling Docker image: $IMAGE..."
if ! docker pull $IMAGE; then
    echo "❌ ERROR: Failed to pull image $IMAGE. Please check internet connection or image name."
    exit 1
fi

# 2. Directory Setup
DATA_DIR="/var/lib/mikhmon-$CLIENT"
mkdir -p "$DATA_DIR"
chmod 777 "$DATA_DIR"

# 3. Container Management
echo "Restarting Container..."
docker stop "mikhmon-$CLIENT" 2>/dev/null || true
docker rm "mikhmon-$CLIENT" 2>/dev/null || true

if ! docker run -d \
  --name "mikhmon-$CLIENT" \
  --restart always \
  -p "127.0.0.1:$PORT:80" \
  -v "$DATA_DIR:/var/www/html/mikhmon" \
  $IMAGE; then
    echo "❌ ERROR: Failed to start Docker container."
    exit 1
fi

# 4. Nginx Configuration
CONF="/etc/nginx/sites-available/default"
echo "Updating Nginx configuration..."

# Clean up any old blocks for this specific client to prevent duplicates
# This is a bit safer: remove lines between location /mikhmon-client and its closing brace
# However, for simplicity in a script, we'll just check if it's there
if grep -q "location /mikhmon-$CLIENT" "$CONF"; then
    echo "⚠️ Nginx block for $CLIENT already exists. Skipping file edit."
else
    # Remove final closing brace of server block
    sed -i '$d' "$CONF"
    
    # Append new proxy block
    cat <<EOF >> "$CONF"
    location /mikhmon-$CLIENT {
        rewrite ^/mikhmon-$CLIENT(/.*)$ \$1 break;
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_redirect off;
    }
}
EOF
    echo "Restarting Nginx..."
    service nginx restart
fi

echo "--- SUCCESS ---"
echo "URL: https://ugpay.tech/mikhmon-$CLIENT"
echo "---"
