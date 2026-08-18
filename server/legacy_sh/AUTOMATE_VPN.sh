#!/bin/bash
# Headless script to add a new Router (Peer) to WireGuard and return JSON
# Usage: ./AUTOMATE_VPN.sh <client_name>

if [ -z "$1" ]; then
    echo "{\"error\": \"Usage: ./AUTOMATE_VPN.sh <client_name>\"}"
    exit 1
fi

CLIENT_NAME=$1
WG_DIR="/etc/wireguard"
CONFIG_FILE="$WG_DIR/wg0.conf"

# Ensure root
if [ "$EUID" -ne 0 ]; then
  echo "{\"error\": \"Please run as root\"}"
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "{\"error\": \"WireGuard config not found at $WG_DIR\"}"
  exit 1
fi

# 1. Generate Client Keys
umask 077
PRIV_KEY=$(wg genkey)
PUB_KEY=$(echo "$PRIV_KEY" | wg pubkey)

# Try to get server public key from standard location or wg show
if [ -f "$WG_DIR/server_public.key" ]; then
    SERVER_PUB=$(cat "$WG_DIR/server_public.key")
else
    SERVER_PUB=$(wg show wg0 public-key 2>/dev/null || echo "PENDING_SERVER_KEY")
fi

PUBLIC_IP=$(curl -s ifconfig.me)

# 2. Find next available IP (Default subnet 10.66.66.x)
LAST_IP=$(grep -oE "10.66.66.[0-9]+" $CONFIG_FILE | sort -V | tail -n 1)
if [ -z "$LAST_IP" ]; then
    NEXT_IP="10.66.66.2" # Start after server (.1)
else
    LAST_OCTET=$(echo $LAST_IP | awk -F. '{print $4}')
    NEXT_OCTET=$((LAST_OCTET + 1))
    NEXT_IP="10.66.66.$NEXT_OCTET"
fi

# 3. Add to Server Config
cat >> $CONFIG_FILE <<EOF

# $CLIENT_NAME
[Peer]
PublicKey = $PUB_KEY
AllowedIPs = $NEXT_IP/32
EOF

# 4. Sync Changes 
wg set wg0 peer "$PUB_KEY" allowed-ips "$NEXT_IP/32"

# 5. Output JSON for Node-JS
echo "{"
echo "  \"vpn_ip\": \"$NEXT_IP\","
echo "  \"vpn_private_key\": \"$PRIV_KEY\","
echo "  \"vpn_public_key\": \"$PUB_KEY\","
echo "  \"vpn_server_pub\": \"$SERVER_PUB\","
echo "  \"vpn_endpoint\": \"$PUBLIC_IP\""
echo "}"
