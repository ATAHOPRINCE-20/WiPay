#!/bin/bash

# SITE_RESTORE.sh
# Restores a WiPay backup from a specific timestamp directory.

BACKUP_DIR=$1

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 /root/wipay_backups/YYYYMMDD_HHMMSS"
    echo "Available backups:"
    ls -d /root/wipay_backups/*/ 2>/dev/null
    exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Error: Backup directory not found at $BACKUP_DIR"
    exit 1
fi

echo "--- 🔄 STARTING FULL SITE RESTORE FROM [$BACKUP_DIR] ---"

# 1. Restore Database
ENV_FILE="/var/www/wipay-server/.env"
DB_SQL="$BACKUP_DIR/database.sql"
if [ -f "$DB_SQL" ] && [ -f "$ENV_FILE" ]; then
    DB_USER=$(grep ^DB_USER= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    DB_PASS=$(grep ^DB_PASSWORD= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    DB_NAME=$(grep ^DB_NAME= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    
    echo "💾 Restoring Database: $DB_NAME..."
    mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$DB_SQL"
else
    echo "⚠️  Skipping database restore (SQL or .env missing)."
fi

# 2. Restore Web Files
echo "📁 Restoring Client files (/var/www/wipay-client)..."
rm -rf /var/www/wipay-client/*
tar -xzf "$BACKUP_DIR/client_files.tar.gz" -C /var/www/

echo "🚀 Restoring Server files (/var/www/wipay-server)..."
# We don't delete node_modules if we didn't back them up, but we want to restore the code.
tar -xzf "$BACKUP_DIR/server_files.tar.gz" -C /var/www/

# 3. Restore Nginx Configs
echo "🌐 Restoring Nginx configurations..."
if [ -d "$BACKUP_DIR/nginx" ]; then
    cp -r "$BACKUP_DIR/nginx/sites-available/"* /etc/nginx/sites-available/
    cp -r "$BACKUP_DIR/nginx/sites-enabled/"* /etc/nginx/sites-enabled/
    cp -r "$BACKUP_DIR/nginx/snippets/"* /etc/nginx/snippets/ 2>/dev/null
fi

# 4. Permissions & Restart
echo "🔑 Applying permissions..."
chown -R www-data:www-data /var/www/wipay-client /var/www/wipay-server
chmod -R 755 /var/www/wipay-client /var/www/wipay-server

echo "🔄 Restarting Services..."
nginx -t && systemctl restart nginx
pm2 restart wipay-server 2>/dev/null || echo "⚠️ PM2 restart skipped."

echo "------------------------------------------"
echo "✅ RESTORE COMPLETE!"
echo "------------------------------------------"
