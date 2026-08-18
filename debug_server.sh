#!/bin/bash
# Server Diagnostic Tool

echo "============================================="
echo "1. DATE & TIME"
echo "============================================="
date

echo -e "\n============================================="
echo "2. NGINX CONFIG TEST (nginx -t)"
echo "============================================="
nginx -t

echo -e "\n============================================="
echo "3. PORT 80 LISTENING CHECK"
echo "============================================="
# Check if anything is listening on port 80
ss -tuln | grep :80

echo -e "\n============================================="
echo "4. NGINX SERVICE STATUS"
echo "============================================="
systemctl status nginx --no-pager

echo -e "\n============================================="
echo "5. PM2 (NODE.JS) STATUS"
echo "============================================="
pm2 list

echo -e "\n============================================="
echo "6. LOCAL CONNECTIVITY TEST (curl localhost)"
echo "============================================="
curl -I http://127.0.0.1/

echo -e "\n============================================="
echo "7. RECENT ERROR LOGS"
echo "============================================="
tail -n 20 /var/log/nginx/error.log
