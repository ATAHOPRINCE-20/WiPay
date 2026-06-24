#!/bin/bash

# Configuration
NGINX_CONF="/etc/nginx/sites-enabled/default"
SNIPPET_FILE="/etc/nginx/snippets/mikhmon_location.conf"

# Backup
cp $NGINX_CONF "$NGINX_CONF.bak"

# 1. Detect PHP-FPM Version
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PHP_SOCK_NAME=$(basename $PHP_SOCK)
echo "Detected PHP Socket: $PHP_SOCK_NAME"

# 2. Create the precise Snippet
mkdir -p /etc/nginx/snippets
cat <<EOF > $SNIPPET_FILE
# --- Isolated Mikhmon Configuration ---
location /mikhmon {
    root /var/www/wipay-client;
    index index.php;

    # Handle all PHP files under /mikhmon/
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/$PHP_SOCK_NAME;
        fastcgi_param SCRIPT_FILENAME \$request_filename;
    }
}
# --------------------------------------
EOF

# 3. Clean up Nginx Config to prevent duplicates
# Remove old style markers or accidental direct pastes
sed -i '/# --- Mikhmon Configuration ---/,/# -----------------------------/d' $NGINX_CONF
sed -i '/# --- Isolated Mikhmon Configuration ---/,/# --------------------------------------/d' $NGINX_CONF
# Remove any existing include lines for this snippet
sed -i '/mikhmon_location.conf/d' $NGINX_CONF

# 4. Inject the single include before the last closing brace
# Search for the very last '}' in the file (main server block close)
# This is a bit safer: find the line number of last '}' and insert before it
LAST_BRACE=$(grep -n "}" $NGINX_CONF | tail -n 1 | cut -d: -f1)
if [ ! -z "$LAST_BRACE" ]; then
    sed -i "${LAST_BRACE}i\    include snippets/mikhmon_location.conf;" $NGINX_CONF
else
    echo "include snippets/mikhmon_location.conf;" >> $NGINX_CONF
fi

echo "Nginx configuration updated via snippet."

echo "Testing Nginx config..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Reloading Nginx..."
    systemctl reload nginx
    echo "✅ Success! Mikhmon should now be accessible at /mikhmon/username/"
else
    echo "❌ Config check failed. Restoring backup..."
    cp "$NGINX_CONF.bak" $NGINX_CONF
    echo "Backup restored."
fi
