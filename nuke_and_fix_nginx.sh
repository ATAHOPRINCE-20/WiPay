#!/bin/bash
# nuke_and_fix_nginx.sh

echo "Stopping Nginx..."
systemctl stop nginx

echo "Cleaning up old configs..."
mkdir -p /etc/nginx/sites-available/backup
mv /etc/nginx/sites-available/* /etc/nginx/sites-available/backup/ 2>/dev/null
rm -f /etc/nginx/sites-enabled/*

echo "Writing fresh config..."
cat > /etc/nginx/sites-available/default <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/wipay-client;
    index login.html index.html;

    server_name _;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # API Proxy - The Fix
    location /api {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Socket.IO Proxy
    location /socket.io/ {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

echo "Enabling site..."
ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/

echo "Testing config..."
nginx -t

echo "Restarting Nginx..."
systemctl start nginx
echo "DONE! Nginx has been reset and running."
