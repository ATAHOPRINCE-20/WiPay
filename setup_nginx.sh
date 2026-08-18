#!/bin/bash
# setup_nginx.sh

cat > /etc/nginx/sites-available/default <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/wipay-client;
    index login.html index.html;

    server_name _;

    # Serve static files (Client)
    location / {
        try_files \$uri \$uri/ =404;
    }

    # Proxy API requests to Node.js
    location /api {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Proxy Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Test and Reload Nginx
nginx -t && systemctl restart nginx
echo "Nginx Configured & Restarted!"
