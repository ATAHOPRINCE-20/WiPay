#!/bin/bash

CONF="/etc/nginx/sites-available/default"

echo "Backing up Nginx config..."
cp $CONF $CONF.bak.docker

# 1. Comment out old Mikhmon block if it exists (Crude but effective)
# sed -i 's/location \/mikhmon/location \/mikhmon_old/g' $CONF

# 2. Append new Proxy Block inside the server block
# This finds the last '}' (closing server) and inserts the location block before it.
# It assumes the last line is '}' or close to it.

PROXY_BLOCK="
    location /mikhmon/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
"

# Remove the closing brace '}' of the server block (usually the last line)
sed -i '$d' $CONF

# Append the proxy block
echo "$PROXY_BLOCK" >> $CONF

# Add the closing brace back
echo "}" >> $CONF

echo "Restarting Nginx..."
service nginx restart
echo "✅ Nginx Updated for Docker Proxy!"
