#!/bin/bash

# 1. Install PHP and dependencies
echo "Installing PHP and dependencies..."
apt-get update
apt-get install -y php-fpm php-common php-mbstring php-xmlrpc php-soap php-gd php-xml php-intl php-mysql php-cli php-zip php-curl unzip

# 2. Setup Mikhmon Directory
echo "Downloading Mikhmon..."
MIKHMON_DIR="/var/www/wipay-client/mikhmon"
mkdir -p $MIKHMON_DIR
cd $MIKHMON_DIR

# 3. Download and Unzip
wget -O mikhmon.zip https://github.com/laksa19/mikhmonv3/archive/refs/heads/master.zip
unzip -o mikhmon.zip
# Move contents to current dir
cp -r mikhmonv3-master/* .
rm -rf mikhmonv3-master mikhmon.zip

# 4. Set Permissions
echo "Setting permissions..."
chown -R www-data:www-data $MIKHMON_DIR
chmod -R 755 $MIKHMON_DIR

# 5. Detect PHP Version for config
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)

echo "----------------------------------------------------------------"
echo "✅ Mikhmon files installed at: $MIKHMON_DIR"
echo "✅ PHP FPM Socket found at: $PHP_SOCK"
echo ""
echo "⚠️  FINAL STEP: Update Nginx API Config ⚠️"
echo "Please edit your Nginx config (nano /etc/nginx/sites-available/default) and add this block inside your 'server' block:"
echo ""
echo "    location /mikhmon {"
echo "        alias $MIKHMON_DIR;"
echo "        index index.php;"
echo "        try_files \$uri \$uri/ /mikhmon/index.php;"
echo ""
echo "        location ~ \.php$ {"
echo "            include snippets/fastcgi-php.conf;"
echo "            fastcgi_pass unix:$(basename $PHP_SOCK);"
echo "            fastcgi_param SCRIPT_FILENAME \$request_filename;"
echo "        }"
echo "    }"
echo ""
echo "Then restart nginx: systemctl restart nginx"
echo "----------------------------------------------------------------"
