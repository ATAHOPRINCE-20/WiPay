#!/bin/bash
# install_and_setup_mikhmon.sh

# 1. Install PHP and dependencies
echo "Installing PHP and dependencies..."
apt-get update
# Install unzip explicitly just in case
apt-get install -y php php-fpm php-mysql php-xml php-curl php-gd php-mbstring php-zip unzip

# Detect PHP Version
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')
PHP_SOCK="unix:/var/run/php/php${PHP_VER}-fpm.sock"
echo "Detected PHP $PHP_VER (Sock: $PHP_SOCK)"

# 2. Setup Mikhmon Directory
echo "Downloading Mikhmon..."
MIKHMON_DIR="/var/www/wipay-client/mikhmon"
MASTER_DIR="/var/www/wipay-client/mikhmon_master"
mkdir -p $MIKHMON_DIR
mkdir -p $MASTER_DIR

cd /tmp
wget -O mikhmon.zip https://github.com/laksa19/mikhmonv3/archive/refs/heads/master.zip
unzip -o mikhmon.zip
cp -r mikhmonv3-master/* $MIKHMON_DIR/
# Populate Master Folder for future isolation
cp -r mikhmonv3-master/* $MASTER_DIR/

# Add autologin bridge to master
cp /var/www/wipay-server/mikhmon_master/autologin.php $MASTER_DIR/ 2>/dev/null || true

rm -rf mikhmonv3-master mikhmon.zip

echo "Setting Permissions..."
chown -R www-data:www-data $MIKHMON_DIR
chmod -R 755 $MIKHMON_DIR

# 3. Configure Nginx
echo "Configuring Nginx with PHP Support..."
cat > /etc/nginx/sites-available/default <<EOF
server {
    listen 80 default_server;
    root /var/www/wipay-client;
    index index.php login.html index.html;
    server_name _;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # Mikhmon & PHP Support
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass $PHP_SOCK;
    }
    
    # Mikhmon Sub-directory (Optional explicit alias, usually works via root)
    location /mikhmon {
        try_files \$uri \$uri/ /mikhmon/index.php;
    }

    location ~ /\.ht {
        deny all;
    }

    # WiPay API Proxy
    location /api {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# 4. Restart Services
echo "Restarting Services..."
systemctl restart php${PHP_VER}-fpm
systemctl restart nginx

echo "DONE! Mikhmon installed at $MIKHMON_DIR and live at /mikhmon"
