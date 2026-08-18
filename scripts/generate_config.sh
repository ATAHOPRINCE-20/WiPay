#!/bin/bash
# Description: Generates a unique MikroTik .rsc script with VPN keys, IPs, and Anti-Sharing rules
# Usage: ./generate_config.sh <client_name>

if [ -z "$1" ]; then
    echo "Usage: ./generate_config.sh <client_name>"
    exit 1
fi

CLIENT_NAME=$1
WG_DIR="/etc/wireguard"
CONFIG_FILE="$WG_DIR/wg0.conf"

# Generate Keys
umask 077
PRIV_KEY=$(wg genkey)
PUB_KEY=$(echo "$PRIV_KEY" | wg pubkey)
SERVER_PUB=$(cat "$WG_DIR/server_public.key" 2>/dev/null || echo "PASTE_SERVER_PUBLIC_KEY")
PUBLIC_IP=$(curl -s ifconfig.me)

# Find Next IP
LAST_IP=$(grep -oE "10.66.66.[0-9]+" $CONFIG_FILE | sort -V | tail -n 1)
if [ -z "$LAST_IP" ]; then
    NEXT_IP="10.66.66.2"
else
    LAST_OCTET=$(echo $LAST_IP | awk -F. '{print $4}')
    NEXT_OCTET=$((LAST_OCTET + 1))
    NEXT_IP="10.66.66.$NEXT_OCTET"
fi

# Add Peer to Server
cat >> $CONFIG_FILE <<EOF

# $CLIENT_NAME
[Peer]
PublicKey = $PUB_KEY
AllowedIPs = $NEXT_IP/32
EOF
wg set wg0 peer "$PUB_KEY" allowed-ips "$NEXT_IP/32"

# Output the MikroTik Script
cat <<EOF
#####################################################
# WiPay AUTO-GENERATED SETUP FOR: $CLIENT_NAME
# Assigned VPN IP: $NEXT_IP
#####################################################

/interface bridge add name=bridge-lan
/interface bridge port
add bridge=bridge-lan interface=ether2
add bridge=bridge-lan interface=ether3
add bridge=bridge-lan interface=ether4
add bridge=bridge-lan interface=wlan1

/ip dhcp-client add interface=ether1 add-default-route=yes disabled=no
/ip address add address=192.168.88.1/24 interface=bridge-lan network=192.168.88.0

/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1
/ip firewall nat add action=masquerade chain=srcnat out-interface=ether1
/ip firewall filter add action=accept chain=input dst-port=8291 protocol=tcp comment="Allow WinBox"

# ANTI-SHARING (TTL 1)
/ip firewall mangle
add action=change-ttl chain=postrouting new-ttl=set:1 out-interface=ether1 passthrough=yes
add action=change-ttl chain=prerouting in-interface=bridge-lan new-ttl=set:1 passthrough=yes

# VPN (WIREGUARD)
/interface wireguard add listen-port=13231 name=wireguard-vps private-key="\$PRIV_KEY"
/interface wireguard peers add allowed-address=10.66.66.0/24 endpoint-address=$PUBLIC_IP endpoint-port=51820 interface=wireguard-vps public-key="\$SERVER_PUB" persistent-keepalive=25
/ip address add address=$NEXT_IP/24 interface=wireguard-vps network=10.66.66.0

# HOTSPOT & WALLED GARDEN
/ip hotspot profile add dns-name=wipay.login hotspot-address=192.168.88.1 name=hsprof1
/ip hotspot add address-pool=default-dhcp disabled=no interface=bridge-lan name=wipay profile=hsprof1
/ip hotspot walled-garden ip
add action=accept dst-port=53 protocol=udp
add action=accept dst-address=$PUBLIC_IP dst-port=443 protocol=tcp

/system clock set time-zone-name=Africa/Kampala
/ip service set api disabled=no port=8728
/ip service set winbox disabled=no port=8291
/ip service set www disabled=yes

:put "Setup Complete for $CLIENT_NAME!"
EOF
