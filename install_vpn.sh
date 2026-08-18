#!/bin/bash
# WireGuard Installer for WiPay Server

echo "Installing WireGuard..."
apt-get update
apt-get install -y wireguard curl

# 1. Enable IP Forwarding
sed -i 's/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/' /etc/sysctl.conf
sysctl -p

# 2. Generate Keys
echo "Generating Keys..."
cd /etc/wireguard
umask 077
wg genkey | tee server_private.key | wg pubkey > server_public.key
wg genkey | tee client1_private.key | wg pubkey > client1_public.key

SERVER_PRIV=$(cat server_private.key)
SERVER_PUB=$(cat server_public.key)
CLIENT_PRIV=$(cat client1_private.key)
CLIENT_PUB=$(cat client1_public.key)
PUBLIC_IP=$(curl -s ifconfig.me)
MAIN_IFACE=$(ip route list default | awk '{print $5}')

# 3. Create Server Config
echo "Creating config for interface: $MAIN_IFACE"
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = 10.66.66.1/24
SaveConfig = true
ListenPort = 51820
PrivateKey = $SERVER_PRIV
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $MAIN_IFACE -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $MAIN_IFACE -j MASQUERADE

# Client 1 (Your Router)
[Peer]
PublicKey = $CLIENT_PUB
AllowedIPs = 10.66.66.2/32
EOF

# 4. Start Service
systemctl enable wg-quick@wg0
systemctl restart wg-quick@wg0

# 5. Output Results
echo ""
echo "========================================================"
echo "✅ VPN SERVER INSTALLED SUCCESSFULLY"
echo "========================================================"
echo "Now, go to your Mikrotik Router -> WireGuard and add this:"
echo ""
echo "--- INTERFACE SETTINGS ---"
echo "Name: wireguard-vps"
echo "Private Key: $CLIENT_PRIV"
echo "Listen Port: 13231"
echo ""
echo "--- PEAR SETTINGS (Click + Peer) ---"
echo "Public Key: $SERVER_PUB"
echo "Endpoint: $PUBLIC_IP"
echo "Endpoint Port: 51820"
echo "Allowed Address: 10.66.66.0/24"
echo "Persistent Keepalive: 25"
echo ""
echo "--- IP ADDRESS SETTINGS ---"
echo "Address: 10.66.66.2/24"
echo "Network: 10.66.66.0"
echo "Interface: wireguard-vps"
echo "========================================================"
