# WiPay — Master MikroTik Hotspot Configuration Guide (RouterOS 7)

This master guide documents the exact setup and troubleshooting steps for connecting your MikroTik router (RouterOS 7.x) to the central WiPay captive portal (`https://wifi.ugpay.tech`) and FreeRADIUS server (`84.46.253.72`).

---

## ⚡ 1-Click Fix Command (Solves Warnings & SSL Redirect Glitches)

If you are experiencing **"This site doesn't support a secure connection"**, **"404 Not Found"**, or **"Network has security issues"** warnings on phones, paste this single block into **WinBox Terminal**:

```routeros
# 1. Update Hotspot Profile DNS Name & Disable HTTPS Interception
/ip hotspot profile set [find] dns-name="wifi.ugpay.tech" login-by=http-pap ssl-certificate=none

# 2. Add Static DNS Resolution for wifi.ugpay.tech
:do { /ip dns static add name="wifi.ugpay.tech" address=84.46.253.72 comment="WiPay SSL DNS" } on-error={}

# 3. Add Clean Walled Garden IP Accept Rule
/ip hotspot walled-garden ip remove [find]
/ip hotspot walled-garden ip add action=accept dst-address=84.46.253.72 comment="Allow VPS IP All Ports"

# 4. Remove Mangle TTL Rules (Prevents Packet Discarding at Hop 1)
:do { /ip firewall mangle remove [find comment~"Anti-Tethering"] } on-error={}

# 5. Overwrite login.html with Complete Untruncated HTTPS Redirect
/file set "hotspot/login.html" contents="<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='0; url=https://wifi.ugpay.tech/captive-portal?slug=wp_9665c1e45e86&link-login=\$(link-login-only)&mac=\$(mac)&ip=\$(ip)&link-orig=\$(link-orig-esc)&error=\$(error)' /><title>Connecting to UGPAY...</title></head><body><div style='font-family: sans-serif; text-align: center; margin-top: 100px; color: #4B5563;'><p style='font-weight: bold;'>Connecting to Wi-Fi Portal...</p><p style='font-size: 14px;'>If you are not redirected automatically, <a href='https://wifi.ugpay.tech/captive-portal?slug=wp_9665c1e45e86&link-login=\$(link-login-only)&mac=\$(mac)&ip=\$(ip)&link-orig=\$(link-orig-esc)&error=\$(error)'>click here</a>.</p></div></body></html>"
```

---

## 🛠️ Step-by-Step Configuration Reference

### Step 1: Device Mode Permission (RouterOS 7.4+ Requirement)
RouterOS 7 requires physical confirmation to enable Hotspot:
1. Terminal: `/system device-mode update hotspot=yes`
2. Within 5 minutes, **briefly press the physical RESET / MODE button** on the router once (1 second tap).

### Step 2: Clock & SNTP Synchronization
Accurate router time is mandatory for WireGuard VPN handshakes and SSL certificate verification:
```routeros
/system clock set time-zone-name="Africa/Kampala"
:do { /system ntp client set enabled=yes } on-error={}
:do { /system ntp client servers add address=162.159.200.1 } on-error={}
:do { /system ntp client servers add address=216.239.35.0 } on-error={}
```

### Step 3: Subnet NAT & Gateway Alignment
Ensure IP Pool (`hs-pool-1`) matches the LAN IP (`192.168.88.1`) and NAT masquerade is placed at position #0:
```routeros
/ip pool set [find name="hs-pool-1"] ranges=192.168.88.10-192.168.88.254
/ip dhcp-server network set [find] address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1,8.8.8.8
:do { /ip firewall nat add chain=srcnat src-address=192.168.88.0/24 action=masquerade place-before=0 comment="UGPAY Hotspot Network NAT" } on-error={}
```

### Step 4: Hotspot Profile & RADIUS PAP
- Login must be set to **HTTP PAP** (`login-by=http-pap`).
- HTTPS interception must be **disabled** (`ssl-certificate=none`) to avoid SYN flooding on port 64875.
- Set `dns-name="wifi.ugpay.tech"` to match SSL certificate.

### Step 5: Walled Garden Rules
- **Walled Garden IP List** (`/ip hotspot walled-garden ip`): Use `action=accept dst-address=84.46.253.72`.
- Note: Do NOT use `action=allow` in Walled Garden IP list — `allow` is only for host lists; `accept` is required for IP lists.

---

## 🔍 Troubleshooting Matrix

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `Hotspot server in RED / invalid` | Device mode locked | Run `/system device-mode update hotspot=yes` & press reset button |
| `net::ERR_ADDRESS_UNREACHABLE` | Mangle TTL=1 rule or invalid IP Walled Garden rule | Run `/ip firewall mangle remove [find]` & check `action=accept` in Walled Garden IP List |
| `SYN flooding on tcp port 64875` | HTTPS interception enabled on router | Turn off HTTPS in Server Profile (`ssl-certificate=none`) |
| `404 Not Found / SSL Warning` | Redirect using raw IP `84.46.253.72` | Set `login.html` & `dns-name` to `https://wifi.ugpay.tech` |
| `VPN Tunnel Down` | Incorrect system clock | Set date/time via `/system clock` and enable SNTP client |
