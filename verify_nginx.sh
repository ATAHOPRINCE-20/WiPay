#!/bin/bash
echo "=== 1. Enabled Sites ==="
ls -l /etc/nginx/sites-enabled/

echo -e "\n=== 2. Current Config Content ==="
cat /etc/nginx/sites-available/default

echo -e "\n=== 3. Nginx Syntax Check ==="
nginx -t

echo -e "\n=== 4. Mikhmon Permissions ==="
namei -l /var/www/wipay-client/mikhmon/index.php

echo -e "\n=== 5. Recent Error Logs ==="
tail -n 20 /var/log/nginx/error.log
