#!/bin/bash
# Script to add a new Router (Peer) to WireGuard

if [ -z "$1" ]; then
    echo "Usage: ./add_router_vpn.sh <client_name>"
    echo "Example: ./add_router_vpn.sh router2"
    exit 1
fi

CLIENT_NAME=$1
WG_DIR="/etc/wireguard"
CONFIG_FILE="$WG_DIR/wg0.conf"

# Ensure root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit
fi

echo "Adding new WireGuard Peer: $CLIENT_NAME"

# 1. Generate Client Keys
umask 077
wg genkey | tee "$WG_DIR/${CLIENT_NAME}_private.key" | wg pubkey > "$WG_DIR/${CLIENT_NAME}_public.key"

CLIENT_PRIV=$(cat "$WG_DIR/${CLIENT_NAME}_private.key")
CLIENT_PUB=$(cat "$WG_DIR/${CLIENT_NAME}_public.key")
SERVER_PUB=$(cat "$WG_DIR/server_public.key")
PUBLIC_IP=$(curl -s ifconfig.me)

# 2. Find next available IP
# This is a simple logic: Start from 10.66.66.3 and increment
# Better approach: Read the last IP from config or assume sequentially if managed well.
# For simplicity, we will search for the highest used octet.

LAST_IP=$(grep -oE "10.66.66.[0-9]+" $CONFIG_FILE | sort -V | tail -n 1)
LAST_OCTET=$(echo $LAST_IP | awk -F. '{print $4}')
NEXT_OCTET=$((LAST_OCTET + 1))
NEXT_IP="10.66.66.$NEXT_OCTET"

echo "Assigning IP: $NEXT_IP"

# 3. Add to Server Config
cat >> $CONFIG_FILE <<EOF

# $CLIENT_NAME
[Peer]
PublicKey = $CLIENT_PUB
AllowedIPs = $NEXT_IP/32
EOF

# 4. Sync Changes (Add peer without restarting interface typically, but wg-quick strip requires restart or manual 'wg set' usage)
# For reliability/simplicity on this setup, we will sync.
wg set wg0 peer "$CLIENT_PUB" allowed-ips "$NEXT_IP/32"

# 5. Output Config for MikroTik
echo ""
echo "========================================================"
echo "✅ NEW ROUTER ADDED: $CLIENT_NAME"
echo "========================================================"
echo "Use these details for the NEW MikroTik Router:"
echo ""
echo "--- INTERFACE SETTINGS ---"
echo "Name: wireguard-vps"
echo "Private Key: $CLIENT_PRIV"
echo "Listen Port: 13231"
echo ""
echo "--- PEER SETTINGS ---"
echo "Public Key: $SERVER_PUB"
echo "Endpoint: $PUBLIC_IP"
echo "Endpoint Port: 51820"
echo "Allowed Address: 10.66.66.0/24"
echo "Persistent Keepalive: 25"
echo ""
echo "--- IP ADDRESS SETTINGS ---"
echo "Address: $NEXT_IP/24"
echo "Network: 10.66.66.0"
echo "Interface: wireguard-vps"
echo "========================================================"
