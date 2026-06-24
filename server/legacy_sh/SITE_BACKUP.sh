#!/bin/bash

# SITE_BACKUP.sh
# Creates a full backup of WiPay (Client, Server, DB, and Nginx)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/wipay_backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo "--- 📦 STARTING FULL SITE BACKUP [$TIMESTAMP] ---"

# 1. Load DB Credentials
ENV_FILE="/var/www/wipay-server/.env"
if [ -f "$ENV_FILE" ]; then
    DB_USER=$(grep ^DB_USER= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    DB_PASS=$(grep ^DB_PASSWORD= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    DB_NAME=$(grep ^DB_NAME= "$ENV_FILE" | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//")
    
    echo "💾 Backing up Database: $DB_NAME..."
    mysqldump --no-tablespaces -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_DIR/database.sql"
else
    echo "⚠️  Warning: .env not found. Database backup skipped."
fi

# 2. Backup Web Files
echo "📁 Backing up Client files (/var/www/wipay-client)..."
tar -czf "$BACKUP_DIR/client_files.tar.gz" -C /var/www wipay-client

echo "🚀 Backing up Server files (/var/www/wipay-server)..."
tar -czf "$BACKUP_DIR/server_files.tar.gz" --exclude="node_modules" -C /var/www wipay-server

# 3. Backup Nginx Configs
echo "🌐 Backing up Nginx configurations..."
mkdir -p "$BACKUP_DIR/nginx"
cp -r /etc/nginx/sites-available "$BACKUP_DIR/nginx/"
cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/nginx/"
cp -r /etc/nginx/snippets "$BACKUP_DIR/nginx/" 2>/dev/null

# 4. Summary
echo "------------------------------------------"
echo "✅ BACKUP SUCCESSFUL!"
echo "Location: $BACKUP_DIR"
echo "Files created:"
ls -lh "$BACKUP_DIR"
echo "------------------------------------------"
