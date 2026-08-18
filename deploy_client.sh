#!/bin/bash

# Usage: ./deploy_client.sh <client_name> <port>
# Example: ./deploy_client.sh hotel_a 8081

CLIENT_NAME=$1
PORT=$2

if [ -z "$CLIENT_NAME" ] || [ -z "$PORT" ]; then
    echo "Usage: ./deploy_client.sh <client_name> <port>"
    echo "Example: ./deploy_client.sh alphahotel 8081"
    exit 1
fi

echo "Deploying Mikhmon for Client: $CLIENT_NAME on Port: $PORT"

# 1. Create Persistent Directory
DATA_DIR="/var/lib/mikhmon-$CLIENT_NAME"
mkdir -p $DATA_DIR
chmod 777 $DATA_DIR

# 2. Run Docker Container
# container name = mikhmon-clientname
# Using a more reliable image: mrizalhp/mikhmonv3
echo "Starting Container..."
docker stop "mikhmon-$CLIENT_NAME" || true
docker rm "mikhmon-$CLIENT_NAME" || true

docker run -d \
  --name "mikhmon-$CLIENT_NAME" \
  --restart always \
  -p 127.0.0.1:$PORT:80 \
  -v $DATA_DIR:/var/www/html/mikhmon \
  mrizalhp/mikhmonv3

# 3. Update Nginx
NGINX_CONF="/etc/nginx/sites-available/default"
cp $NGINX_CONF "${NGINX_CONF}.bak.$(date +%s)"

echo "Adding Nginx Proxy Block..."

# Improved block to handle trailing slashes and internal redirects better
PROXY_BLOCK="
    location /mikhmon-$CLIENT_NAME {
        rewrite ^/mikhmon-$CLIENT_NAME(/.*)$ \$1 break;
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_redirect off;
    }
"

# We check if this location already exists to avoid duplicates
if grep -q "location /mikhmon-$CLIENT_NAME" "$NGINX_CONF"; then
    echo "Location block already exists. Skipping Nginx update."
else
    # Remove last line (})
    sed -i '$d' $NGINX_CONF
    # Append block and close
    echo "$PROXY_BLOCK" >> $NGINX_CONF
    echo "}" >> $NGINX_CONF
    
    # 4. Restart Nginx
    echo "Restarting Nginx..."
    service nginx restart
fi

echo "----------------------------------------------------"
echo "✅ Client Deployed Successfully!"
echo "URL: https://ugpay.tech/mikhmon-$CLIENT_NAME"
echo "Container: mikhmon-$CLIENT_NAME"
echo "Port: $PORT"
echo "----------------------------------------------------"
