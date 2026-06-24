#!/bin/bash

# Configuration
DB_NAME="wipay"
DB_USER="root"
# Note: If DB has a password, it should be provided via .my.cnf or -p (carefully)
# For this setup, we assume root with no password or handled by environment.

BACKUP_DIR="/var/www/backups"
DATE=$(date +%Y-%m-%d_%H%M%S)
APP_BACKUP_NAME="wipay_files_$DATE.tar.gz"
DB_BACKUP_NAME="wipay_db_$DATE.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "--- Starting Backup $DATE ---"

# 1. Database Backup
echo "Exporting Database..."
mysqldump -u $DB_USER $DB_NAME > $BACKUP_DIR/$DB_BACKUP_NAME

# 2. Files Backup (Server and Client)
echo "Archiving Application Files..."
tar --exclude='node_modules' --exclude='*.log' -czf $BACKUP_DIR/$APP_BACKUP_NAME -C /var/www wipay-server wipay-client

echo "--- Backup Complete! ---"
echo "Location: $BACKUP_DIR"
echo "Files:"
echo "  - $DB_BACKUP_NAME"
echo "  - $APP_BACKUP_NAME"

# Optional: Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -type f -mtime +7 -name "*.gz" -delete
find $BACKUP_DIR -type f -mtime +7 -name "*.sql" -delete
