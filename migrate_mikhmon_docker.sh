#!/bin/bash

# 1. Install Docker (if not present)
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    echo "Docker already installed."
fi

# 2. Setup Persistent Directory
DATA_DIR="/var/lib/mikhmon-docker"
mkdir -p $DATA_DIR
chmod 777 $DATA_DIR

# 3. Stop/Remove Old Container (Safe Restart)
echo "Stopping any existing Mikhmon containers..."
docker stop mikhmon || true
docker rm mikhmon || true

# 4. Run Mikhmon Container (Using lighter image compatible with v3)
# Mapping internal port 80 to host 8080
echo "Starting Mikhmon Container on Port 8080..."
docker run -d \
  --name mikhmon \
  --restart always \
  -p 127.0.0.1:8080:80 \
  -v $DATA_DIR:/var/www/html/mikhmon \
  aakhulutech/mikhmon:latest

# 5. Connect Container to Network (Optional, mostly for bridge)
# (Docker handles NAT automatically)

# 6. Update Nginx Config
echo "Updating Nginx Proxy..."
NGINX_CONF="/etc/nginx/sites-available/default"

# Backup
cp $NGINX_CONF ${NGINX_CONF}.bak.native

# Check if /mikhmon block exists using simple grep, if so we replace it or manual patch
# For safety, I will overwrite the specific block logic if possible, or append.
# EASIEST WAY: Use sed to CHANGE the location block we added earlier.

# We look for the line "location /mikhmon {" and replace the block? 
# Too complex for sed. Let's just output the instruction for manual verify or use a smart sed.

# Smart Sed: Find 'location /mikhmon {' ... replace content until '}'? Hard.
# Strategy: Since I wrote the previous block, I can overwrite the file or ask user to update.
# BUT, automation is key.

# Let's try to overwrite the file content assuming standard structure? Risky.
# SAFE BET: I will tell the user to run this, then I will run a separate connection command for Nginx
# Or I can use a separate Nginx config file for Mikhmon? No, specific location needs to be inside server block.

echo "Waiting for container to init..."
sleep 5

echo "------------------------------------------------------"
echo "✅ Docker Mikhmon Installed!"
echo "------------------------------------------------------"
echo "Next Step: Update Nginx to Proxy Pass."
echo "I will do this via a separate text block update to be safe."
