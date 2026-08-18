#!/bin/bash
# Fix Permissions for WiPay Client

echo "Fixing permissions..."

# 1. Directories should be 755 (Owner: rwx, Group: r-x, Other: r-x)
find /var/www/wipay-client -type d -exec chmod 755 {} \;

# 2. Files should be 644 (Owner: rw-, Group: r--, Other: r--)
find /var/www/wipay-client -type f -exec chmod 644 {} \;

# 3. Ensure Ownership
chown -R www-data:www-data /var/www/wipay-client

echo "✅ Permissions updated."
echo "Checking CSS folder:"
ls -la /var/www/wipay-client/css/
