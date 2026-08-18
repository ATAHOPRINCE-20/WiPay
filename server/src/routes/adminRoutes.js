const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { sendSMS } = require('../utils/sms');
const { syncVoucherToRadius, syncBatchVouchersToRadius, deleteVoucherFromRadius } = require('../utils/radius');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Configure Multer for temp uploads
const upload = multer({ dest: 'uploads/' });

// Middleware applied to all routes in this file
router.use('/admin', authenticateToken);

// --- Categories ---
router.post('/admin/categories', async (req, res) => {
    const { name, router_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const [result] = await db.query('INSERT INTO categories (name, admin_id, router_id) VALUES (?, ?, ?)', [name, req.user.id, router_id || null]);
        req.io.emit('data_update', { type: 'categories' });
        res.json({ id: result.insertId, name, router_id, message: 'Category created' });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

router.get('/admin/categories', async (req, res) => {
    try {
        const router_id = req.query.router_id;
        let query = 'SELECT * FROM categories WHERE admin_id = ?';
        let params = [req.user.id];

        if (router_id && router_id !== 'all') {
            query += ' AND router_id = ?'; // STRICT: Show ONLY specific
            params.push(router_id);
        } else {
            // For "All", maybe show everything? Or only Globals?
            // Let's show everything for now.
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});



router.put('/admin/categories/:id', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const [result] = await db.query('UPDATE categories SET name = ? WHERE id = ? AND admin_id = ?', [name, req.params.id, req.user.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });

        req.io.emit('data_update', { type: 'categories' });
        req.io.emit('data_update', { type: 'packages' }); // Cascaded UI update
        res.json({ message: 'Category updated successfully' });
    } catch (err) {
        console.error('Update Category Error:', err);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

router.delete('/admin/categories/:id', async (req, res) => {
    const categoryId = req.params.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verify Category Ownership
        const [cat] = await connection.query('SELECT id FROM categories WHERE id = ? AND admin_id = ?', [categoryId, req.user.id]);
        if (cat.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Category not found' });
        }

        // 2. Get Package IDs linked to this category
        const [packages] = await connection.query('SELECT id FROM packages WHERE category_id = ?', [categoryId]);
        const packageIds = packages.map(p => p.id);

        if (packageIds.length > 0) {
            // 3. Delete Vouchers linked to these packages
            const placeholders = packageIds.map(() => '?').join(',');
            await connection.query(`DELETE FROM vouchers WHERE package_id IN (${placeholders})`, packageIds);

            // 4. Delete Packages
            await connection.query('DELETE FROM packages WHERE category_id = ?', [categoryId]);
        }

        // 5. Delete Category
        await connection.query('DELETE FROM categories WHERE id = ?', [categoryId]);

        await connection.commit();
        req.io.emit('data_update', { type: 'categories' });
        req.io.emit('data_update', { type: 'packages' }); // Cascaded
        req.io.emit('data_update', { type: 'vouchers' }); // Cascaded
        res.json({ message: 'Category and all related data deleted successfully' });

    } catch (err) {
        await connection.rollback();
        console.error('Delete Category Error:', err);
        res.status(500).json({ error: 'Failed to delete category' });
    } finally {
        connection.release();
    }
});


const { generateWgKeys, allocateVpnIp, rebuildWireGuardConfig } = require('../utils/vpn');
const { execSync } = require('child_process');

function getVpsWgPublicKey() {
    if (process.env.WG_SERVER_PUBLIC_KEY) return process.env.WG_SERVER_PUBLIC_KEY;
    try {
        return execSync('sudo cat /etc/wireguard/server_public.key', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    } catch (e) {
        return 'YOUR_VPS_WG_PUBLIC_KEY';
    }
}

function generateMikrotikScript({ routerName, vpnIp, routerPrivateKey, vpsPublicIp, vpsWgPublicKey, radiusSecret, portalSlug, centralDomain }) {
    const wgPubKey = vpsWgPublicKey || getVpsWgPublicKey();
    return `# ======================================================
# --- UGPAY MikroTik Master Setup Script ---
# Router: ${routerName} | VPN IP: ${vpnIp}
# Portal: https://${centralDomain}
# ======================================================

# 1. Create LAN Bridge & Assign IP Address
:do { /interface bridge add name=bridge-lan comment="UGPAY LAN Bridge" } on-error={}
:do { /interface bridge port add bridge=bridge-lan interface=ether2 comment="LAN Port 2" } on-error={}
:do { /interface bridge port add bridge=bridge-lan interface=ether3 comment="LAN Port 3" } on-error={}
:do { /interface bridge port add bridge=bridge-lan interface=ether4 comment="LAN Port 4" } on-error={}
:do { /interface bridge port add bridge=bridge-lan interface=ether5 comment="LAN Port 5" } on-error={}
:do { /ip address add address=192.168.88.1/24 interface=bridge-lan comment="UGPAY LAN IP" } on-error={}

# 2. Configure WAN Internet & NAT
:do { /ip dhcp-client add interface=ether1 disabled=no add-default-route=yes comment="UGPAY WAN Client" } on-error={}
:do { /ip firewall nat add chain=srcnat src-address=192.168.88.0/24 action=masquerade place-before=0 comment="UGPAY Hotspot NAT" } on-error={}
:do { /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="UGPAY Internet NAT" } on-error={}

# 3. Enable Wi-Fi (wlan1)
:do { /interface wireless enable [find default-name=wlan1] } on-error={}
:do { /interface wireless set [find default-name=wlan1] mode=ap-bridge ssid="UGPAY Free WiFi" disabled=no } on-error={}
:do { /interface bridge port add bridge=bridge-lan interface=wlan1 comment="Wi-Fi Port" } on-error={}

# 4. DNS & TCP MSS
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1 cache-size=4096KiB
:do { /ip dns static add name="${centralDomain}" address=${vpsPublicIp} comment="WiPay DNS" } on-error={}
:do { /ip firewall mangle add chain=forward protocol=tcp tcp-flags=syn action=change-mss new-mss=clamp-to-pmtu comment="Fix MTU MSS" } on-error={}

# 5. DHCP Pool for Hotspot Users
:do { /ip pool add name=hs-pool-1 ranges=192.168.88.10-192.168.88.254 } on-error={}
:do { /ip dhcp-server add name=dhcp-hs interface=bridge-lan address-pool=hs-pool-1 disabled=no } on-error={}
:do { /ip dhcp-server network add address=192.168.88.0/24 gateway=192.168.88.1 dns-server=192.168.88.1,8.8.8.8 } on-error={}

# 6. Hotspot Profile & Server
# CRITICAL: dns-name must be a fake local name like "wifi.spot" — NOT the portal domain!
# If dns-name = portal domain, MikroTik intercepts all HTTPS to that domain and
# sends TCP RST -> ERR_CONNECTION_CLOSED on phones (no SSL cert on router).
:do { /ip hotspot profile add name=hsprof-ugpay hotspot-address=192.168.88.1 dns-name="wifi.spot" html-directory=hotspot use-radius=yes login-by=cookie,http-pap http-cookie-lifetime=30d mac-cookie-timeout=30d ssl-certificate=none radius-interim-update=1m idle-timeout=5m keepalive-timeout=none } on-error={}
:do { /ip hotspot profile set hsprof-ugpay hotspot-address=192.168.88.1 dns-name="wifi.spot" login-by=cookie,http-pap http-cookie-lifetime=30d mac-cookie-timeout=30d ssl-certificate=none use-radius=yes radius-interim-update=1m idle-timeout=5m keepalive-timeout=none } on-error={}
:do { /ip hotspot profile set [find default=yes] dns-name="wifi.spot" login-by=cookie,http-pap http-cookie-lifetime=30d mac-cookie-timeout=30d ssl-certificate=none use-radius=yes radius-interim-update=1m idle-timeout=5m keepalive-timeout=none } on-error={}
:do { /ip hotspot add name=hs-ugpay interface=bridge-lan address-pool=hs-pool-1 profile=hsprof-ugpay idle-timeout=5m keepalive-timeout=none disabled=no } on-error={}

# 7. Firewall Forward Rules — MUST be placed before any drop rules!
# These allow HTTP(80) & HTTPS(443) to the VPS before hotspot can intercept.
# Without this, MikroTik kills port 443 to VPS -> ERR_CONNECTION_CLOSED.
# WARNING: Do NOT add anti-tethering TTL=1 mangle rules — they kill ALL forwarded packets!
:do { /ip firewall filter add chain=forward action=accept dst-address=${vpsPublicIp} protocol=tcp dst-port=443 place-before=0 comment="Allow HTTPS to WiPay VPS" } on-error={}
:do { /ip firewall filter add chain=forward action=accept dst-address=${vpsPublicIp} protocol=tcp dst-port=80 place-before=0 comment="Allow HTTP to WiPay VPS" } on-error={}
:do { /ip firewall filter add chain=forward action=accept src-address=192.168.88.0/24 dst-address=${vpsPublicIp} place-before=0 comment="Allow All to WiPay VPS" } on-error={}

# 8. Walled Garden (unauthenticated access to portal & payment gateways)
# IP List: action=accept + dst-address  |  Host List: action=allow + dst-host
:do { /ip hotspot walled-garden ip add action=accept protocol=17 dst-port=53 comment="Allow DNS" } on-error={}
:do { /ip hotspot walled-garden ip add action=accept dst-address=${vpsPublicIp} comment="Allow WiPay VPS All Ports" } on-error={}
:do { /ip hotspot walled-garden add dst-host="${centralDomain}" action=allow comment="Allow Central Portal" } on-error={}
:do { /ip hotspot walled-garden add dst-host="*.relworx.com" action=allow comment="Allow Relworx Gateway" } on-error={}
:do { /ip hotspot walled-garden add dst-host="fonts.googleapis.com" action=allow comment="Allow Google Fonts" } on-error={}
:do { /ip hotspot walled-garden add dst-host="fonts.gstatic.com" action=allow comment="Allow Google Fonts Assets" } on-error={}

# 9. NTP Time Sync (RouterOS 7 syntax)
# CRITICAL: Wrong clock breaks WireGuard handshakes & SSL certificate validation!
:do { /system ntp client set enabled=yes } on-error={}
:do { /system ntp client servers add address=162.159.200.1 } on-error={}
:do { /system ntp client servers add address=216.239.35.0 } on-error={}
:do { /system clock set time-zone-name="Africa/Kampala" } on-error={}

# 10. WireGuard VPN
:do { /interface wireguard peers remove [find interface=wg-wipay] } on-error={}
:do { /ip address remove [find interface=wg-wipay] } on-error={}
:do { /interface wireguard remove [find name=wg-wipay] } on-error={}
/interface wireguard add name=wg-wipay listen-port=51820 private-key="${routerPrivateKey || ''}" comment="UGPAY VPN"
/ip address add address=${vpnIp}/24 interface=wg-wipay comment="UGPAY VPN IP"
/interface wireguard peers add interface=wg-wipay public-key="${wgPubKey}" endpoint-address=${vpsPublicIp} endpoint-port=51820 allowed-address=10.66.66.1/32 persistent-keepalive=25s comment="UGPAY VPS"

# 11. RADIUS (over WireGuard — communicates via 10.66.66.1)
:if ([:len [/radius find service=hotspot]] = 0) do={
  /radius add service=hotspot address=10.66.66.1 src-address=${vpnIp} secret="${radiusSecret || 'secret123'}" authentication-port=1812 accounting-port=1813 timeout=3s comment="UGPAY RADIUS"
} else={
  /radius set [find service=hotspot] address=10.66.66.1 src-address=${vpnIp} secret="${radiusSecret || 'secret123'}" authentication-port=1812 accounting-port=1813 timeout=3s
}
/radius incoming set accept=yes port=3799

# 12. Hotspot login.html — CRITICAL NOTES:
# - Use https:// + domain name (NOT raw IP) — Nginx 404s on raw IP, serves app on domain only.
# - The dns-name="wifi.spot" above ensures MikroTik does NOT own ${centralDomain},
#   so HTTPS to ${centralDomain} passes straight to VPS without MikroTik interception.
:if ([:len [/file find name="hotspot/login.html"]] > 0) do={
  /file set "hotspot/login.html" contents="<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='0; url=https://${centralDomain}/captive-portal?slug=${portalSlug}&link-login=\\$(link-login-only)&mac=\\$(mac)&ip=\\$(ip)&link-orig=\\$(link-orig-esc)&error=\\$(error)' /><title>Connecting...</title></head><body><div style='font-family:sans-serif;text-align:center;margin-top:100px;color:#4B5563'><p style='font-weight:bold'>Connecting to Wi-Fi Portal...</p><p style='font-size:14px'>If not redirected, <a href='https://${centralDomain}/captive-portal?slug=${portalSlug}&link-login=\\$(link-login-only)&mac=\\$(mac)&ip=\\$(ip)&link-orig=\\$(link-orig-esc)&error=\\$(error)'>click here</a>.</p></div></body></html>"
} else={
  /file add name="hotspot/login.html" contents="<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='0; url=https://${centralDomain}/captive-portal?slug=${portalSlug}&link-login=\\$(link-login-only)&mac=\\$(mac)&ip=\\$(ip)&link-orig=\\$(link-orig-esc)&error=\\$(error)' /><title>Connecting...</title></head><body><div style='font-family:sans-serif;text-align:center;margin-top:100px;color:#4B5563'><p style='font-weight:bold'>Connecting to Wi-Fi Portal...</p><p style='font-size:14px'>If not redirected, <a href='https://${centralDomain}/captive-portal?slug=${portalSlug}&link-login=\\$(link-login-only)&mac=\\$(mac)&ip=\\$(ip)&link-orig=\\$(link-orig-esc)&error=\\$(error)'>click here</a>.</p></div></body></html>"
}
`;
}

// --- Routers ---
const { fetchLiveActiveHotspotUsers, fetchConnectedDevices, disconnectHotspotUser, fetchRouterLogs } = require('../utils/mikrotikApi');

router.post('/admin/routers', async (req, res) => {
    const { name, ip_address, secret, api_port, api_user, api_password } = req.body;
    if (!name || !secret) {
        return res.status(400).json({ error: 'Router Name and RADIUS Secret are required' });
    }

    try {
        // 1. Allocate IP if not provided
        let finalIp = ip_address ? ip_address.trim() : null;
        if (!finalIp) {
            finalIp = await allocateVpnIp();
        }

        // 2. Generate WireGuard keys
        const { privateKey, publicKey } = generateWgKeys();

        // 3. Insert into routers table
        const [result] = await db.query(
            'INSERT INTO routers (name, ip_address, radius_secret, wg_private_key, wg_public_key, admin_id, api_port, api_user, api_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, finalIp, secret, privateKey, publicKey, req.user.id, parseInt(api_port, 10) || 8728, api_user || 'admin', api_password || null]
        );
        const routerId = result.insertId;

        // 4. Insert or update in FreeRADIUS nas table
        try {
            await db.query(
                `INSERT INTO nas (nasname, shortname, type, secret, description) 
                 VALUES (?, ?, 'mikrotik', ?, ?) 
                 ON DUPLICATE KEY UPDATE secret = VALUES(secret), shortname = VALUES(shortname)`,
                [finalIp, name, secret, `Router ID ${routerId}`]
            );
        } catch (nasErr) {
            console.warn('[ROUTER] Could not update NAS table:', nasErr.message);
        }

        // 5. Rebuild WireGuard config on VPS
        await rebuildWireGuardConfig();

        // 6. Fetch Admin Portal Slug & VPS Domain
        let portalSlug = 'default';
        try {
            const [adminRows] = await db.query('SELECT portal_slug FROM admins WHERE id = ?', [req.user.id]);
            if (adminRows.length > 0 && adminRows[0].portal_slug) {
                portalSlug = adminRows[0].portal_slug;
            }
        } catch (e) {}

        const vpsIp = process.env.VPS_PUBLIC_IP || process.env.DOMAIN || '84.46.253.72';
        const vpsWgPublicKey = process.env.WG_SERVER_PUBLIC_KEY || getVpsWgPublicKey();

        // 7. Build MikroTik Setup Script
        const script = generateMikrotikScript({
            routerName: name,
            vpnIp: finalIp,
            routerPrivateKey: privateKey,
            vpsPublicIp: vpsIp,
            vpsWgPublicKey: vpsWgPublicKey,
            radiusSecret: secret,
            portalSlug: portalSlug,
            centralDomain: process.env.CENTRAL_DOMAIN || 'wifi.ugpay.tech'
        });

        req.io.emit('data_update', { type: 'routers' });
        res.json({ id: routerId, name, ip_address: finalIp, script, message: 'Router added successfully' });

    } catch (err) {
        console.error('Create Router Error:', err);
        res.status(500).json({ error: 'Failed to add router: ' + err.message });
    }
});

router.get('/admin/routers/stats', async (req, res) => {
    try {
        const adminId = req.user.id;
        const [routers] = await db.query(`
            SELECT 
                r.*,
                COALESCE(t.total_revenue, 0) as total_revenue,
                COALESCE(t.daily_revenue, 0) as daily_revenue,
                COALESCE(v.voucher_stock, 0) as voucher_stock
            FROM routers r
            LEFT JOIN (
                SELECT 
                    router_id,
                    SUM(amount) as total_revenue,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END) as daily_revenue
                FROM transactions
                WHERE status = 'success'
                GROUP BY router_id
            ) t ON r.id = t.router_id
            LEFT JOIN (
                SELECT p.router_id, COUNT(v.id) as voucher_stock
                FROM vouchers v
                JOIN packages p ON v.package_id = p.id
                WHERE (v.is_used = 0 OR v.is_used IS NULL)
                GROUP BY p.router_id
            ) v ON r.id = v.router_id
            WHERE r.admin_id = ?
            ORDER BY r.created_at DESC
        `, [adminId]);

        res.json(routers);
    } catch (err) {
        console.error('Fetch Routers Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch router stats' });
    }
});

router.get('/admin/routers', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT r.*,
                   (SELECT COUNT(*) 
                    FROM radacct a 
                    WHERE a.acctstoptime IS NULL 
                      AND a.nasipaddress = r.ip_address
                   ) as active_sessions_count
            FROM routers r 
            WHERE r.admin_id = ? 
            ORDER BY r.created_at DESC
        `, [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Routers Error:', err);
        res.status(500).json({ error: 'Failed to fetch routers' });
    }
});

router.get('/admin/routers/sessions', async (req, res) => {
    try {
        // Auto-activate any newly connected vouchers so first_used_at and expires_at are permanently calculated from first login
        await db.query(`
            UPDATE vouchers v
            INNER JOIN radacct a ON LOWER(a.username) = LOWER(v.code)
            LEFT JOIN packages p ON p.id = v.package_id
            SET v.first_used_at = COALESCE(v.first_used_at, a.acctstarttime),
                v.is_used = 1,
                v.expires_at = COALESCE(v.expires_at, DATE_ADD(a.acctstarttime, INTERVAL (
                    CASE 
                        WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                        WHEN p.validity_hours IS NOT NULL AND p.validity_hours > 0 THEN (p.validity_hours * 3600)
                        WHEN p.validity_minutes IS NOT NULL AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                        ELSE 86400
                    END
                ) SECOND))
            WHERE v.first_used_at IS NULL AND a.acctstoptime IS NULL
        `).catch(err => console.warn('[Auto Activation Warning]:', err.message));

        // Auto-close any expired sessions in radacct where expires_at <= NOW()
        await db.query(`
            UPDATE radacct a
            INNER JOIN vouchers v ON LOWER(v.code) = LOWER(a.username)
            SET a.acctstoptime = COALESCE(a.acctstoptime, NOW()),
                a.acctterminatecause = 'Session-Timeout'
            WHERE a.acctstoptime IS NULL
              AND v.expires_at IS NOT NULL
              AND v.expires_at <= NOW()
        `).catch(err => console.warn('[Auto Session Cleanup Warning]:', err.message));

        const [rows] = await db.query(`
            SELECT a.username, a.nasipaddress, a.framedipaddress, a.callingstationid,
                   a.acctinputoctets, a.acctoutputoctets, MAX(a.acctstarttime) as acctstarttime, a.acctsessiontime,
                   MAX(COALESCE(v.first_used_at, a.acctstarttime)) as first_logged_in,
                   MAX(COALESCE(r.name, 'Router')) as router_name,
                   MAX(r.id) as router_id,
                   MAX(CASE
                       WHEN v.expires_at IS NOT NULL THEN ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), v.expires_at)) / 3600, 4)
                       WHEN p.validity_unit = 'minutes' THEN ROUND(GREATEST(0, (COALESCE(p.validity_minutes, 0) * 60)) / 3600, 4)
                       WHEN p.validity_unit = 'hours' THEN ROUND(GREATEST(0, (COALESCE(p.validity_hours, 0) * 3600)) / 3600, 4)
                       WHEN p.validity_hours IS NOT NULL AND p.validity_hours > 0 THEN ROUND(GREATEST(0, (COALESCE(p.validity_hours, 0) * 3600)) / 3600, 4)
                       WHEN p.validity_minutes IS NOT NULL AND p.validity_minutes > 0 THEN ROUND(GREATEST(0, (COALESCE(p.validity_minutes, 0) * 60)) / 3600, 4)
                       ELSE NULL
                   END) as session_time_left
            FROM radacct a
            LEFT JOIN routers r ON (a.nasipaddress = r.ip_address)
            LEFT JOIN vouchers v ON LOWER(v.code) = LOWER(a.username)
            LEFT JOIN packages p ON p.id = v.package_id
            WHERE a.acctstoptime IS NULL
              AND (v.expires_at IS NULL OR v.expires_at > NOW())
              AND (r.admin_id = ? OR v.admin_id = ? OR p.admin_id = ?)
            GROUP BY a.username, a.callingstationid, a.nasipaddress, a.framedipaddress, a.acctinputoctets, a.acctoutputoctets, a.acctsessiontime
            ORDER BY acctstarttime DESC
            LIMIT 200
        `, [req.user.id, req.user.id, req.user.id]);

        // Trigger background cleanup in case any stale sessions need hardware disconnect
        const { cleanupStaleRadiusSessions } = require('../utils/radius');
        cleanupStaleRadiusSessions().catch(() => {});

        res.json(rows);
    } catch (err) {
        console.error('Fetch Sessions Error:', err);
        res.json([]);
    }
});

// Terminate an active user session (Admin action - strictly scoped to tenant)
router.post('/admin/routers/sessions/terminate', async (req, res) => {
    const { username, router_id, mac } = req.body;
    if (!username && !mac) {
        return res.status(400).json({ error: 'Username or MAC address is required' });
    }

    try {
        const targetUser = username || mac;
        const { disconnectHotspotUser } = require('../utils/mikrotikApi');
        const { disconnectVoucherSession } = require('../utils/radius');

        // 1. Terminate on MikroTik hardware if router_id is supplied
        if (router_id) {
            const [routers] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [router_id, req.user.id]);
            if (routers.length > 0) {
                const r = routers[0];
                await disconnectHotspotUser({
                    host: r.ip_address,
                    port: r.api_port || 8728,
                    user: r.api_user || 'admin',
                    password: r.api_password || ''
                }, targetUser).catch(e => console.warn('[MikroTik API Disconnect Warning]:', e.message));
            }
        }

        // 2. Disconnect in FreeRADIUS
        if (username) {
            await disconnectVoucherSession(username, 'Admin-Reset').catch(e => console.warn('[RADIUS Disconnect Warning]:', e.message));
        }

        // 3. Mark session stopped in radacct (strictly verified for logged-in tenant)
        await db.query(`
            UPDATE radacct a
            LEFT JOIN routers r ON (a.nasipaddress = r.ip_address)
            LEFT JOIN vouchers v ON v.code = a.username
            LEFT JOIN packages p ON p.id = v.package_id
            SET a.acctstoptime = NOW(), a.acctterminatecause = 'Admin-Reset' 
            WHERE (a.username = ? OR a.callingstationid = ?) 
              AND a.acctstoptime IS NULL
              AND (r.admin_id = ? OR v.admin_id = ? OR p.admin_id = ?)
        `, [targetUser, targetUser, req.user.id, req.user.id, req.user.id]);

        res.json({ message: `Session for ${targetUser} successfully terminated.`, success: true });
    } catch (err) {
        console.error('[Terminate Session Error]:', err);
        res.status(500).json({ error: 'Failed to terminate session: ' + err.message });
    }
});

router.get('/admin/routers/:id/script', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Router not found' });

        const routerItem = rows[0];
        let portalSlug = 'default';
        try {
            const [adminRows] = await db.query('SELECT portal_slug FROM admins WHERE id = ?', [req.user.id]);
            if (adminRows.length > 0 && adminRows[0].portal_slug) {
                portalSlug = adminRows[0].portal_slug;
            }
        } catch (e) {}

        const vpsIp = process.env.VPS_PUBLIC_IP || process.env.DOMAIN || '84.46.253.72';
        const vpsWgPublicKey = process.env.WG_SERVER_PUBLIC_KEY || getVpsWgPublicKey();

        const script = generateMikrotikScript({
            routerName: routerItem.name,
            vpnIp: routerItem.ip_address,
            routerPrivateKey: routerItem.wg_private_key,
            vpsPublicIp: vpsIp,
            vpsWgPublicKey: vpsWgPublicKey,
            radiusSecret: routerItem.radius_secret,
            portalSlug: portalSlug,
            centralDomain: process.env.CENTRAL_DOMAIN || 'wifi.ugpay.tech'
        });

        res.json({ script });
    } catch (err) {
        console.error('Fetch Router Script Error:', err);
        res.status(500).json({ error: 'Failed to generate router script' });
    }
});

router.get('/admin/routers/:id/live-active', async (req, res) => {
    try {
        const [routers] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (routers.length === 0) return res.status(404).json({ error: 'Router not found' });

        const r = routers[0];
        try {
            const liveUsers = await fetchLiveActiveHotspotUsers({
                host: r.ip_address,
                port: r.api_port || 8728,
                user: r.api_user || 'admin',
                password: r.api_password || ''
            });
            return res.json({ source: 'mikrotik_api', router_name: r.name, users: liveUsers });
        } catch (apiErr) {
            console.warn(`[Live Active] MikroTik API unreachable for router ${r.id} (${r.ip_address}):`, apiErr.message);
            
            // Fallback to radacct table
            const [rows] = await db.query(`
                SELECT a.username, a.nasipaddress, a.framedipaddress, a.callingstationid,
                       a.acctinputoctets, a.acctoutputoctets, MAX(a.acctstarttime) as acctstarttime, a.acctsessiontime,
                       '0s' as uptime,
                       MAX(CASE
                           WHEN v.expires_at IS NOT NULL THEN ROUND(GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), v.expires_at)) / 3600, 4)
                           WHEN p.validity_unit = 'minutes' THEN ROUND(GREATEST(0, (COALESCE(p.validity_minutes, 0) * 60)) / 3600, 4)
                           WHEN p.validity_unit = 'hours' THEN ROUND(GREATEST(0, (COALESCE(p.validity_hours, 0) * 3600)) / 3600, 4)
                           WHEN p.validity_hours IS NOT NULL AND p.validity_hours > 0 THEN ROUND(GREATEST(0, (COALESCE(p.validity_hours, 0) * 3600)) / 3600, 4)
                           WHEN p.validity_minutes IS NOT NULL AND p.validity_minutes > 0 THEN ROUND(GREATEST(0, (COALESCE(p.validity_minutes, 0) * 60)) / 3600, 4)
                           ELSE NULL
                       END) as session_time_left,
                       'radius_db' as source
                FROM radacct a
                LEFT JOIN vouchers v ON LOWER(v.code) = LOWER(a.username)
                LEFT JOIN packages p ON p.id = v.package_id
                WHERE a.acctstoptime IS NULL
                  AND (v.expires_at IS NULL OR v.expires_at > NOW())
                  AND (a.nasipaddress = ? OR a.nasipaddress = ?)
                GROUP BY a.username, a.callingstationid
                ORDER BY acctstarttime DESC
            `, [r.ip_address, r.ip_address]);

            return res.json({ source: 'radius_db', router_name: r.name, users: rows, warning: 'MikroTik API unreachable. Showing RADIUS fallback.' });
        }
    } catch (err) {
        console.error('Fetch Live Active Users Error:', err);
        res.status(500).json({ error: 'Failed to fetch active users' });
    }
});

router.get('/admin/routers/:id/live-devices', async (req, res) => {
    try {
        const [routers] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (routers.length === 0) return res.status(404).json({ error: 'Router not found' });

        const r = routers[0];
        try {
            const devices = await fetchConnectedDevices({
                host: r.ip_address,
                port: r.api_port || 8728,
                user: r.api_user || 'admin',
                password: r.api_password || ''
            });
            return res.json({ source: 'mikrotik_api', router_name: r.name, devices });
        } catch (apiErr) {
            console.warn(`[Live Devices] MikroTik API unreachable for router ${r.id} (${r.ip_address}):`, apiErr.message);

            // Fallback to unique MAC addresses in radacct
            const [rows] = await db.query(`
                SELECT DISTINCT callingstationid as mac, framedipaddress as ip, username as hostname, 
                       'radius_db' as source, 'bound' as status
                FROM radacct 
                WHERE (nasipaddress = ? OR nasipaddress = ?) AND callingstationid IS NOT NULL AND callingstationid != ''
                ORDER BY acctstarttime DESC LIMIT 100
            `, [r.ip_address, r.ip_address]);

            return res.json({ source: 'radius_db', router_name: r.name, devices: rows, warning: 'MikroTik API unreachable. Showing RADIUS fallback.' });
        }
    } catch (err) {
        console.error('Fetch Live Devices Error:', err);
        res.status(500).json({ error: 'Failed to fetch connected devices' });
    }
});

router.get('/admin/routers/:id/logs', async (req, res) => {
    try {
        const [routers] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (routers.length === 0) return res.status(404).json({ error: 'Router not found' });

        const r = routers[0];
        const limit = parseInt(req.query.limit, 10) || 100;

        try {
            const logs = await fetchRouterLogs({
                host: r.ip_address,
                port: r.api_port || 8728,
                user: r.api_user || 'admin',
                password: r.api_password || ''
            }, limit);

            if (logs && logs.length > 0) {
                return res.json({ source: 'mikrotik_api', router_name: r.name, logs });
            }
        } catch (apiErr) {
            console.warn(`[Logs] MikroTik API unreachable for router ${r.id} (${r.ip_address}):`, apiErr.message);
        }

        // Always fallback smoothly to FreeRADIUS authentication logs for this admin
        let fallbackLogs = [];
        try {
            const [postauthLogs] = await db.query(`
                SELECT rp.id, rp.username, rp.reply, rp.authdate as time
                FROM radpostauth rp
                JOIN vouchers v ON LOWER(v.code) = LOWER(rp.username)
                WHERE v.admin_id = ?
                ORDER BY rp.id DESC LIMIT ?
            `, [req.user.id, limit]);

            fallbackLogs = postauthLogs.map(l => ({
                id: `pa-${l.id}`,
                time: l.time ? new Date(l.time).toLocaleTimeString() : '',
                topics: l.reply === 'Access-Accept' ? 'hotspot,info' : 'hotspot,error',
                message: `User '${l.username}': ${l.reply}`
            }));
        } catch (dbErr) {
            console.error('[Logs Fallback Error]:', dbErr);
        }

        return res.json({
            source: 'radius_fallback',
            router_name: r.name,
            warning: 'MikroTik API (port 8728) unreachable. Showing RADIUS authentication logs.',
            logs: fallbackLogs
        });
    } catch (err) {
        console.error('Fetch Router Logs Error:', err);
        res.status(500).json({ error: 'Failed to fetch router logs' });
    }
});

router.post('/admin/routers/:id/disconnect-user', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    try {
        const [routers] = await db.query('SELECT * FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (routers.length === 0) return res.status(404).json({ error: 'Router not found' });

        const r = routers[0];
        const { disconnectVoucherSession } = require('../utils/radius');

        // 1. Try API disconnect
        const apiSuccess = await disconnectHotspotUser({
            host: r.ip_address,
            port: r.api_port || 8728,
            user: r.api_user || 'admin',
            password: r.api_password || ''
        }, username).catch(() => false);

        // 2. Try RADIUS CoA disconnect
        const radiusSuccess = await disconnectVoucherSession(username).catch(() => false);

        if (apiSuccess || radiusSuccess) {
            req.io.emit('data_update', { type: 'sessions' });
            res.json({ success: true, message: `Disconnected ${username} successfully.` });
        } else {
            res.status(400).json({ error: `Could not disconnect ${username}. Session may already be closed.` });
        }
    } catch (err) {
        console.error('Disconnect User Error:', err);
        res.status(500).json({ error: 'Failed to disconnect user' });
    }
});

router.put('/admin/routers/:id', async (req, res) => {
    const { name, ip_address, secret, wg_public_key, api_port, api_user, api_password } = req.body;
    try {
        let updateQuery = 'UPDATE routers SET name = ?';
        let params = [name];
        if (ip_address) {
            updateQuery += ', ip_address = ?';
            params.push(ip_address);
        }
        if (secret) {
            updateQuery += ', radius_secret = ?';
            params.push(secret);
        }
        if (wg_public_key) {
            updateQuery += ', wg_public_key = ?';
            params.push(wg_public_key);
        }
        if (api_port !== undefined) {
            updateQuery += ', api_port = ?';
            params.push(parseInt(api_port, 10) || 8728);
        }
        if (api_user !== undefined) {
            updateQuery += ', api_user = ?';
            params.push(api_user || 'admin');
        }
        if (api_password !== undefined) {
            updateQuery += ', api_password = ?';
            params.push(api_password);
        }
        updateQuery += ' WHERE id = ? AND admin_id = ?';
        params.push(req.params.id, req.user.id);

        await db.query(updateQuery, params);

        if (ip_address && secret) {
            try {
                await db.query(
                    `INSERT INTO nas (nasname, shortname, type, secret, description) 
                     VALUES (?, ?, 'mikrotik', ?, ?) 
                     ON DUPLICATE KEY UPDATE secret = VALUES(secret), shortname = VALUES(shortname)`,
                    [ip_address, name, secret, `Router ID ${req.params.id}`]
                );
            } catch (e) {}
        }

        // Rebuild WireGuard configuration on VPS to keep VPN in sync
        await rebuildWireGuardConfig();

        req.io.emit('data_update', { type: 'routers' });
        res.json({ message: 'Router updated successfully' });
    } catch (err) {
        console.error('Update Router Error:', err);
        res.status(500).json({ error: 'Failed to update router' });
    }
});

router.delete('/admin/routers/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        await rebuildWireGuardConfig();
        req.io.emit('data_update', { type: 'routers' });
        res.json({ message: 'Router deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete router' });
    }
});

// --- Packages ---
router.post('/admin/packages', async (req, res) => {
    const { name, price, validity_hours, validity_minutes, validity_unit, category_id, data_limit_mb, router_id, rate_limit, simultaneous_devices } = req.body;

    if (!name || !price || !category_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let unit = validity_unit || 'hours';
        let vHours = parseFloat(validity_hours) || 0;
        let vMins = parseInt(validity_minutes, 10) || 0;

        if (unit === 'minutes' || unit === 'mins') {
            unit = 'minutes';
            vHours = vMins > 0 ? vMins / 60 : vHours;
            vMins = vMins > 0 ? vMins : Math.round(vHours * 60);
        } else if (unit === 'days') {
            vHours = (parseFloat(req.body.validity_days) || vHours || 1) * 24;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else if (unit === 'weeks') {
            vHours = (parseFloat(req.body.validity_weeks) || (vHours > 0 ? vHours / 168 : 1)) * 168;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else if (unit === 'months') {
            vHours = (parseFloat(req.body.validity_months) || (vHours > 0 ? vHours / 720 : 1)) * 720;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else {
            unit = 'hours';
            vHours = vHours > 0 ? vHours : (vMins / 60);
            vMins = Math.round(vHours * 60);
        }

        await db.query(`
            INSERT INTO packages (category_id, name, price, validity_hours, validity_minutes, validity_unit, data_limit_mb, rate_limit, simultaneous_devices, created_at, admin_id, router_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)
        `, [category_id, name, price, vHours, vMins, unit, data_limit_mb || 0, rate_limit || '1M/1M', simultaneous_devices || 1, req.user.id, router_id || null]);
        req.io.emit('data_update', { type: 'packages' });
        res.json({ message: 'Package created successfully' });
    } catch (err) {
        console.error('Create Package Error:', err);
        res.status(500).json({ error: 'Failed to create package' });
    }
});

router.patch('/admin/packages/:id/toggle', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT is_active FROM packages WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Package not found' });

        const currentState = rows[0].is_active;
        const newState = !currentState;

        await db.query('UPDATE packages SET is_active = ? WHERE id = ?', [newState, req.params.id]);
        req.io.emit('data_update', { type: 'packages' });
        res.json({ message: 'Package status updated', is_active: newState });
    } catch (err) {
        console.error('Toggle Package Error:', err);
        res.status(500).json({ error: 'Failed to update package status' });
    }
});

router.get('/admin/packages', async (req, res) => {
    try {
        const targetAdminId = req.user.role === 'agent' ? req.user.admin_id : req.user.id;
        const router_id = req.query.router_id;
        let query = `
            SELECT p.id, p.name, p.price, p.validity_hours, p.validity_minutes, p.validity_unit, p.data_limit_mb, p.rate_limit, p.simultaneous_devices, p.is_active, p.created_at, c.name as category_name, p.router_id,
                   (SELECT COUNT(*) FROM vouchers v WHERE v.package_id = p.id AND (v.is_used = 0 OR v.is_used IS NULL)) as vouchers_count
            FROM packages p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.admin_id = ?
        `;
        let params = [targetAdminId];

        if (router_id && router_id !== 'all') {
            query += ' AND p.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY p.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Packages Error:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

router.put('/admin/packages/:id', async (req, res) => {
    const { name, price, validity_hours, validity_minutes, validity_unit, data_limit_mb, category_id, rate_limit, simultaneous_devices, is_active } = req.body;

    // Handle partial toggle update if only is_active is provided
    if (is_active !== undefined && !name && !price && !category_id) {
        try {
            await db.query('UPDATE packages SET is_active = ? WHERE id = ? AND admin_id = ?', [is_active ? 1 : 0, req.params.id, req.user.id]);
            req.io.emit('data_update', { type: 'packages' });
            return res.json({ message: 'Package status updated', is_active: !!is_active });
        } catch (err) {
            console.error('Toggle Package Status Error:', err);
            return res.status(500).json({ error: 'Failed to update package status' });
        }
    }

    if (!name || !price || !category_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        let unit = validity_unit || 'hours';
        let vHours = parseFloat(validity_hours) || 0;
        let vMins = parseInt(validity_minutes, 10) || 0;

        if (unit === 'minutes' || unit === 'mins') {
            unit = 'minutes';
            vHours = vMins > 0 ? vMins / 60 : vHours;
            vMins = vMins > 0 ? vMins : Math.round(vHours * 60);
        } else if (unit === 'days') {
            vHours = (parseFloat(req.body.validity_days) || vHours || 1) * 24;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else if (unit === 'weeks') {
            vHours = (parseFloat(req.body.validity_weeks) || (vHours > 0 ? vHours / 168 : 1)) * 168;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else if (unit === 'months') {
            vHours = (parseFloat(req.body.validity_months) || (vHours > 0 ? vHours / 720 : 1)) * 720;
            vMins = Math.round(vHours * 60);
            unit = 'hours';
        } else {
            unit = 'hours';
            vHours = vHours > 0 ? vHours : (vMins / 60);
            vMins = Math.round(vHours * 60);
        }

        const [result] = await db.query(`
            UPDATE packages 
            SET name = ?, price = ?, validity_hours = ?, validity_minutes = ?, validity_unit = ?, data_limit_mb = ?, category_id = ?, rate_limit = ?, simultaneous_devices = ?, is_active = ?
            WHERE id = ? AND admin_id = ?
        `, [name, price, vHours, vMins, unit, data_limit_mb || 0, category_id, rate_limit || '1M/1M', simultaneous_devices || 1, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id, req.user.id]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Package not found' });

        req.io.emit('data_update', { type: 'packages' });
        res.json({ message: 'Package updated successfully' });
    } catch (err) {
        console.error('Update Package Error:', err);
        res.status(500).json({ error: 'Failed to update package: ' + err.message });
    }
});

router.delete('/admin/packages/:id', async (req, res) => {
    const packageId = req.params.id;
    const adminId = req.user.id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Verify package ownership
        const [pkgRows] = await connection.query('SELECT id FROM packages WHERE id = ? AND admin_id = ?', [packageId, adminId]);
        if (pkgRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Package not found' });
        }

        // 2. Unlink package from transactions to prevent foreign key errors
        await connection.query('UPDATE transactions SET package_id = NULL WHERE package_id = ?', [packageId]).catch(() => {});

        // 3. Fetch all vouchers linked to this package for RADIUS cleanup
        const [vouchers] = await connection.query('SELECT code FROM vouchers WHERE package_id = ?', [packageId]);

        // 4. Delete or unlink vouchers
        try {
            await connection.query('DELETE FROM vouchers WHERE package_id = ?', [packageId]);
        } catch (vErr) {
            console.warn('[Delete Package] Partial voucher deletion fallback:', vErr.message);
            await connection.query('DELETE FROM vouchers WHERE package_id = ? AND (is_used = 0 OR is_used IS NULL)', [packageId]).catch(() => {});
            await connection.query('UPDATE vouchers SET package_id = NULL WHERE package_id = ?', [packageId]).catch(() => {});
        }

        // 5. Delete the package
        await connection.query('DELETE FROM packages WHERE id = ? AND admin_id = ?', [packageId, adminId]);

        await connection.commit();

        // 6. RADIUS Cleanup asynchronously
        for (const v of vouchers) {
            deleteVoucherFromRadius(v.code).catch(err => console.error('[RADIUS] Deletion error:', err));
        }

        req.io.emit('data_update', { type: 'packages' });
        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ message: 'Package deleted successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Delete Package Error:', err);
        res.status(500).json({ error: 'Failed to delete package: ' + err.message });
    } finally {
        connection.release();
    }
});

// --- Vouchers ---
router.post('/admin/vouchers/import', upload.single('file'), async (req, res) => {
    const { package_id, router_id } = req.body; // router_id might come from frontend if package is global

    if (!req.file || !package_id) {
        return res.status(400).json({ error: 'File and package_id are required' });
    }

    const results = [];
    const BATCH_SIZE = 500;
    let totalInserted = 0;

    // Check if package has a router_id
    // If YES, vouchers inherit it. If NO, vouchers might use the passed router_id (if we allow Global Packages to have Specific Vouchers? Complicated. 
    // Simplified Logic: Vouchers inherit Package's router_id. If package is Global, Vouchers are Global. 
    // OR: Vouchers created under specific router view get that router_id.
    // Let's lookup package first.
    let packageRouterId = null;
    try {
        const [pkgRows] = await db.query('SELECT router_id FROM packages WHERE id = ?', [package_id]);
        if (pkgRows.length > 0) packageRouterId = pkgRows[0].router_id;
    } catch (e) { console.error("Error looking up package router:", e); }

    // Final Router ID for vouchers: Package's ID takes precedence (strict), or fallback to passed ID?
    // If Package is Specific, vouchers MUST be specific to that router.
    // If Package is Global (NULL), vouchers CAN be specific (if sold from specific router view) or Global.
    // Use packageRouterId if exists, otherwise use req.body.router_id
    const finalRouterId = packageRouterId || router_id || null;

    const processBatch = async (batch) => {
        if (batch.length === 0) return;

        // Adaptive placeholder: code, comment, package_ref
        const strictValues = [];
        batch.forEach(row => {
            const code = row.code || (Object.values(row)[0]); // First column as code
            const comment = row.comment || null;
            const pkgRef = row.package_ref || null;
            strictValues.push(package_id, code, comment, pkgRef, req.user.id, finalRouterId);
        });

        // We added router_id to the insert columns
        const strictPlaceholder = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');

        const [result] = await db.query(`INSERT IGNORE INTO vouchers (package_id, code, comment, package_ref, admin_id, router_id) VALUES ${strictPlaceholder}`, strictValues);
        totalInserted += result.affectedRows;
    };

    try {
        const stream = fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
                results.push(data);
                if (results.length >= BATCH_SIZE) {
                    stream.pause(); // Pause reading while writing to DB
                    const batch = results.splice(0, BATCH_SIZE);
                    processBatch(batch)
                        .then(() => stream.resume())
                        .catch(err => {
                            console.error('Batch Insert Error:', err);
                            stream.destroy(err);
                        });
                }
            })
            .on('end', async () => {
                // Process remaining
                if (results.length > 0) {
                    await processBatch(results);
                }
                // Cleanup file
                fs.unlink(req.file.path, (err) => { if (err) console.error('Cleanup Error:', err); });
                req.io.emit('data_update', { type: 'vouchers' });
                res.json({ message: `Import complete. Processed ${totalInserted} vouchers.` });
            })
            .on('error', (err) => {
                console.error('CSV Stream Error:', err);
                res.status(500).json({ error: 'Failed to process CSV file' });
            });

    } catch (err) {
        console.error('Import Setup Error:', err);
        res.status(500).json({ error: 'Server error during import setup' });
    }
});

function generateVoucherCode(length, prefix, charType = 'upper_num') {
    let chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

    switch (charType) {
        case 'numbers':
            chars = '0123456789';
            break;
        case 'lower_num':
            chars = '23456789abcdefghijkmnpqrstuvwxyz';
            break;
        case 'mixed_num':
            chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
            break;
        case 'upper':
            chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
            break;
        case 'lower':
            chars = 'abcdefghijkmnpqrstuvwxyz';
            break;
        case 'mixed':
            chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
            break;
        case 'upper_num':
        default:
            chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
            break;
    }

    const crypto = require('crypto');
    let code = '';
    const charLen = chars.length;
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, charLen);
        code += chars.charAt(randomIndex);
    }
    return (prefix || '') + code;
}

router.post('/admin/vouchers/generate', async (req, res) => {
    const { package_id, quantity, prefix, code_length, char_type, is_giveaway, batch_ref, agent_id } = req.body;
    
    if (!package_id || !quantity || quantity <= 0 || quantity > 500) {
        return res.status(400).json({ error: 'Valid package ID and quantity (max 500) are required' });
    }

    try {
        const [pkg] = await db.query('SELECT id, router_id FROM packages WHERE id = ? AND admin_id = ?', [package_id, req.user.id]);
        if (pkg.length === 0) return res.status(404).json({ error: 'Package not found' });

        const router_id = pkg[0].router_id;
        const insertValues = [];
        const generateLength = parseInt(code_length) || 8;
        const assignedAgentId = agent_id ? parseInt(agent_id, 10) : null;

        const generatedCodesSet = new Set();
        // Fetch existing active codes across ALL tenants to prevent cross-tenant collisions
        const [existingRows] = await db.query('SELECT code FROM vouchers WHERE status IS NULL OR status != "expired"');
        const existingCodes = new Set(existingRows.map(r => r.code ? r.code.toLowerCase() : ''));

        for (let i = 0; i < quantity; i++) {
            let code = generateVoucherCode(generateLength, prefix, char_type);
            let attempts = 0;
            while ((existingCodes.has(code.toLowerCase()) || generatedCodesSet.has(code.toLowerCase())) && attempts < 20) {
                code = generateVoucherCode(generateLength, prefix, char_type);
                attempts++;
            }
            generatedCodesSet.add(code.toLowerCase());
            existingCodes.add(code.toLowerCase());
            insertValues.push([code, package_id, req.user.id, router_id, assignedAgentId, is_giveaway ? 1 : 0, batch_ref || null]);
        }

        // Batch insert
        await db.query(
            'INSERT INTO vouchers (code, package_id, admin_id, router_id, agent_id, is_giveaway, package_ref) VALUES ?',
            [insertValues]
        );

        // Background RADIUS sync
        const syncList = insertValues.map(v => ({ code: v[0], packageId: package_id }));
        syncBatchVouchersToRadius(syncList).catch(err => console.error('[RADIUS] Batch sync error:', err));

        req.io.emit('data_update', { type: 'vouchers' });
        req.io.emit('data_update', { type: 'agents' });
        res.json({ message: `Successfully generated ${quantity} vouchers.` });
    } catch (err) {
        console.error('Generate Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to generate vouchers: ' + err.message });
    }
});

router.post('/admin/agents/:id/assign-vouchers', async (req, res) => {
    const agentId = req.params.id;
    const { package_id, quantity } = req.body;
    const adminId = req.user.id;

    if (!package_id || !quantity || parseInt(quantity, 10) <= 0) {
        return res.status(400).json({ error: 'Package ID and valid quantity are required' });
    }

    try {
        // Verify agent belongs to this admin
        const [agentRows] = await db.query('SELECT id, username FROM agents WHERE id = ? AND admin_id = ?', [agentId, adminId]);
        if (agentRows.length === 0) return res.status(404).json({ error: 'Agent not found' });

        const assignQty = parseInt(quantity, 10);

        // Find available unassigned vouchers for this package
        const [vouchers] = await db.query(
            'SELECT id FROM vouchers WHERE package_id = ? AND admin_id = ? AND (is_used = 0 OR is_used IS NULL) AND (agent_id IS NULL OR agent_id = 0) LIMIT ?',
            [package_id, adminId, assignQty]
        );

        if (vouchers.length === 0) {
            return res.status(400).json({ error: 'No unassigned vouchers available for this package. Please generate vouchers first.' });
        }

        const voucherIds = vouchers.map(v => v.id);
        await db.query(
            'UPDATE vouchers SET agent_id = ? WHERE id IN (?)',
            [agentId, voucherIds]
        );

        req.io.emit('data_update', { type: 'vouchers' });
        req.io.emit('data_update', { type: 'agents' });

        res.json({
            message: `Successfully assigned ${voucherIds.length} voucher(s) to agent ${agentRows[0].username}`,
            assigned_count: voucherIds.length
        });
    } catch (err) {
        console.error('Assign Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to assign vouchers: ' + err.message });
    }
});

router.get('/admin/vouchers/export', async (req, res) => {
    const { package_id } = req.query;
    if (!package_id) {
        return res.status(400).json({ error: 'Package ID is required' });
    }

    try {
        const [rows] = await db.query(`
            SELECT v.code, p.name as package_name, p.price, v.is_used, v.used_by, v.used_at, v.created_at, v.package_ref, v.is_giveaway
            FROM vouchers v
            JOIN packages p ON v.package_id = p.id
            WHERE v.package_id = ? AND v.admin_id = ?
            ORDER BY v.created_at DESC
        `, [package_id, req.user.id]);

        let csv = 'Code,Package,Price,Status,Used By,Used At,Created At,Batch Ref,Giveaway\n';
        rows.forEach(r => {
            const status = r.is_used ? 'Used' : 'Available';
            const usedAt = r.used_at ? new Date(r.used_at).toISOString() : '';
            const createdAt = r.created_at ? new Date(r.created_at).toISOString() : '';
            csv += `"${r.code}","${r.package_name}",${r.price},"${status}","${r.used_by || ''}","${usedAt}","${createdAt}","${r.package_ref || ''}","${r.is_giveaway ? 'Yes' : 'No'}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=vouchers-pkg-${package_id}.csv`);
        res.send(csv);
    } catch (err) {
        console.error('Export Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to export vouchers: ' + err.message });
    }
});

router.post('/admin/vouchers/bulk-delete', async (req, res) => {
    const { package_id, filter } = req.body;
    if (!package_id) {
        return res.status(400).json({ error: 'Package ID is required' });
    }

    try {
        let whereClause = 'package_id = ? AND admin_id = ?';
        let params = [package_id, req.user.id];

        if (filter === 'expired') {
            whereClause += ' AND (status = "expired" OR (expires_at IS NOT NULL AND expires_at < NOW()))';
        } else if (filter === 'used') {
            whereClause += ' AND is_used = TRUE';
        } else if (filter === 'all') {
            // Delete all vouchers for this package
        } else {
            // Default: unused only
            whereClause += ' AND is_used = FALSE';
        }

        const [vouchers] = await db.query(`SELECT code FROM vouchers WHERE ${whereClause}`, params);
        const [result] = await db.query(`DELETE FROM vouchers WHERE ${whereClause}`, params);

        for (const v of vouchers) {
            deleteVoucherFromRadius(v.code).catch(err => console.error('[RADIUS] Deletion error:', err));
        }

        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ message: `Deleted ${result.affectedRows} vouchers successfully` });
    } catch (err) {
        console.error('Bulk Delete Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to delete vouchers: ' + err.message });
    }
});

// Single Voucher Deletion (Admin action - strictly scoped to tenant)
router.delete('/admin/vouchers/:id', async (req, res) => {
    try {
        const [vouchers] = await db.query('SELECT code FROM vouchers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (vouchers.length === 0) return res.status(404).json({ error: 'Voucher not found' });

        const code = vouchers[0].code;
        await db.query('DELETE FROM vouchers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        await deleteVoucherFromRadius(code).catch(err => console.error('[RADIUS] Deletion error:', err));

        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ success: true, message: `Voucher '${code}' deleted successfully` });
    } catch (err) {
        console.error('Delete Voucher Error:', err);
        res.status(500).json({ error: 'Failed to delete voucher' });
    }
});

router.get('/admin/vouchers', async (req, res) => {
    try {
        const { router_id, package_id, is_used } = req.query;

        let query = `
            SELECT v.id, v.code, v.comment, v.package_ref, v.is_used, v.is_giveaway, v.used_by, v.used_at, v.created_at, v.router_id,
                   p.id as pkg_id, p.name as package_name, p.price as package_price
            FROM vouchers v
            LEFT JOIN packages p ON v.package_id = p.id
            WHERE v.admin_id = ?
        `;
        let params = [req.user.id];

        if (is_used !== undefined && is_used !== '') {
            query += ' AND v.is_used = ?';
            params.push(is_used === '1' || is_used === 'true' ? 1 : 0);
        }

        if (package_id) {
            query += ' AND v.package_id = ?';
            params.push(package_id);
        }

        if (router_id && router_id !== 'all') {
            query += ' AND v.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY v.created_at DESC LIMIT 500';

        const [rows] = await db.query(query, params);
        
        const formatted = rows.map(r => ({
            ...r,
            package: r.pkg_id ? { id: r.pkg_id, name: r.package_name, price: r.package_price } : null
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Fetch Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to fetch vouchers.' });
    }
});


const RELWORX_API_URL = 'https://payments.relworx.com/api/mobile-money/request-payment';
const RELWORX_API_KEY = process.env.RELWORX_API_KEY;
const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;

router.get('/admin/sms-balance', async (req, res) => {
    try {
        // Calculate balance: Sum of SUCCESS deposits - Sum of usage
        // Note: Usage rows (type='usage') are naturally negative in amount, so straight SUM works 
        // IF we filter properly. Usage doesn't have a status usually, or defaults to success.
        // Let's assume usage is always valid. Deposits must be 'success'.
        const [rows] = await db.query(`
            SELECT SUM(amount) as balance 
            FROM sms_fees 
            WHERE admin_id = ? 
            AND (status = 'success' OR status IS NULL)
            AND type != 'subscription'
        `, [req.user.id]);

        const balance = rows[0].balance || 0;
        res.json({ balance: Math.max(0, Number(balance)) });
    } catch (err) {
        console.error('Fetch SMS Balance Error:', err);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

router.post('/admin/buy-sms', async (req, res) => {
    const { amount, phone_number } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount is required' });
    if (!phone_number) return res.status(400).json({ error: 'Phone number is required' });

    try {
        // Format Phone (Robust)
        let formattedPhone = phone_number.replace(/\s+/g, ''); // Remove spaces
        if (formattedPhone.startsWith('256')) formattedPhone = '+' + formattedPhone;
        else if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+256' + formattedPhone; // Assume local if completely raw

        // Limit Check (Uganda numbers are usually 13 chars: +256 7XX XXX XXX)
        if (formattedPhone.length < 10) return res.status(400).json({ error: 'Invalid phone number length' });

        const reference = `SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 1. Insert Pending Record
        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, amount, 'deposit', `Pending Top up via ${formattedPhone}`, 'pending', reference]);

        // 2. Call Relworx
        const response = await fetch(RELWORX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            },
            body: JSON.stringify({
                account_no: RELWORX_ACCOUNT_NO,
                reference: reference,
                msisdn: formattedPhone,
                currency: 'UGX',
                amount: Number(amount),
                description: `SMS Topup`
            })
        });

        const paymentData = await response.json();

        if (response.ok) {
            res.json({
                message: 'Payment request initiated. Please check your phone.',
                status: 'pending',
                reference: reference
            });
        } else {
            console.error(`[SMS-TOPUP-ERROR] Gateway Failed:`, paymentData);
            await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [reference]);

            // Pass the exact message from Relworx to the frontend
            const errorMsg = paymentData.message || paymentData.description || 'Unknown gateway error';
            res.status(400).json({ error: errorMsg, details: paymentData });
        }
    } catch (err) {
        console.error('Buy SMS Error:', err);
        res.status(500).json({ error: 'Failed to process purchase: ' + err.message });
    }
});

router.get('/admin/sms-status/:reference', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT status, amount FROM sms_fees WHERE reference = ? AND admin_id = ?', [req.params.reference, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        const localStatus = rows[0].status;

        // If success or failed, return immediately
        if (localStatus === 'success' || localStatus === 'failed') {
            return res.json({ status: localStatus });
        }

        // --- Active Backup Poll (For Localhost/Backup) ---
        const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${req.params.reference}&internal_reference=${req.params.reference}`;

        try {
            const gwRes = await fetch(checkUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.relworx.v2',
                    'Authorization': `Bearer ${RELWORX_API_KEY}`
                }
            });

            if (!gwRes.ok) return res.json({ status: 'pending' }); // Keep waiting

            const gwData = await gwRes.json();
            const gwStatus = (gwData.status || '').toUpperCase();
            const itemStatus = (gwData.item_status || '').toUpperCase();

            // Check Success
            if (gwStatus === 'SUCCESS' || itemStatus === 'SUCCESS') {
                await db.query('UPDATE sms_fees SET status = "success" WHERE reference = ?', [req.params.reference]);
                return res.json({ status: 'success' });
            }
            // Check Failure
            else if (gwStatus === 'FAILED' || itemStatus === 'FAILED') {
                await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [req.params.reference]);
                return res.json({ status: 'failed' });
            }

            return res.json({ status: 'pending' });

        } catch (fetchErr) {
            console.error('[SMS-POLL] Fetch Error:', fetchErr);
            return res.json({ status: 'pending' });
        }

    } catch (err) {
        console.error('Check SMS Status Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/admin/sell-voucher', async (req, res) => {
    const { package_id, phone_number } = req.body;
    const SMS_COST = 35;

    if (!package_id || !phone_number) {
        return res.status(400).json({ error: 'Package and Phone number required' });
    }

    const connection = await db.getConnection(); // Use transaction

    try {
        await connection.beginTransaction();

        // 0. Check SMS Balance
        const [balRows] = await connection.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [req.user.id]);
        const balance = Number(balRows[0].balance || 0);

        if (balance < SMS_COST) {
            await connection.rollback();
            return res.status(400).json({ error: `Insufficient SMS balance. Cost: ${SMS_COST} UGX, Balance: ${balance} UGX` });
        }

        // 1. Get Package details
        const [packages] = await connection.query('SELECT * FROM packages WHERE id = ?', [package_id]);
        if (packages.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Package not found' });
        }
        const pkg = packages[0];

        // 2. Get Available Voucher
        const [vouchers] = await connection.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE AND admin_id = ? LIMIT 1 FOR UPDATE', [package_id, req.user.id]);
        if (vouchers.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'No vouchers available for this package' });
        }
        const voucher = vouchers[0];

        // 3. Mark Voucher Used
        await connection.query('UPDATE vouchers SET is_used = 1, used_by = ?, used_at = NOW() WHERE id = ?', [phone_number, voucher.id]);

        // 4. Deduct SMS Cost
        await connection.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
            [req.user.id, -SMS_COST, `Voucher Sale: ${voucher.code}`]);

        // 5. Send SMS & Refund if sending fails
        const message = `Code: ${voucher.code}. Package: ${pkg.name}.`;
        const smsSuccess = await sendSMS(phone_number, message, req.user.id);
        if (!smsSuccess) {
            await connection.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "refund", ?, "success")',
                [req.user.id, SMS_COST, `Refund: SMS Failed (Ref: ${voucher.code})`]);
        }

        // 6. Record SMS Log
        try {
            await connection.query('INSERT INTO sms_logs (phone_number, message, status, admin_id) VALUES (?, ?, ?, ?)',
                [phone_number, message, smsSuccess ? 'sent' : 'failed', req.user.id]);
        } catch (logErr) {
            console.warn('SMS Log skipped:', logErr.message);
        }

        await connection.commit();
        req.io.emit('data_update', { type: 'vouchers' });
        req.io.emit('data_update', { type: 'sms' });
        res.json({ message: 'Voucher sold and sent via SMS', voucher: voucher.code });

    } catch (err) {
        await connection.rollback();
        console.error('Sell Voucher Error:', err);
        res.status(500).json({ error: 'Transaction failed' });
    } finally {
        connection.release();
    }
});

router.delete('/admin/vouchers', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No IDs provided' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const [vouchers] = await db.query(`SELECT code FROM vouchers WHERE id IN (${placeholders}) AND admin_id = ?`, [...ids, req.user.id]);

        await db.query(`DELETE FROM vouchers WHERE id IN (${placeholders}) AND admin_id = ?`, [...ids, req.user.id]);

        for (const v of vouchers) {
            deleteVoucherFromRadius(v.code).catch(err => console.error('[RADIUS] Deletion error:', err));
        }

        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ message: `Deleted ${ids.length} vouchers` });
    } catch (err) {
        console.error('Delete Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to delete vouchers: ' + err.message });
    }
});

// --- Transactions / Payments History ---
router.get('/admin/transactions', async (req, res) => {
    try {
        const { router_id } = req.query;
        let query = `
            SELECT t.id, t.transaction_ref, t.phone_number, t.amount, t.status, t.payment_method, t.voucher_code, t.created_at, 
                   p.name as package_name, r.name as router_name, a.username as agent_name
            FROM transactions t
            LEFT JOIN packages p ON t.package_id = p.id
            LEFT JOIN routers r ON t.router_id = r.id
            LEFT JOIN agents a ON t.agent_id = a.id
            WHERE t.admin_id = ?
        `;
        const params = [req.user.id];

        if (router_id) {
            query += ' AND t.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY t.created_at DESC LIMIT 500';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Transactions Error:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});


// --- Analytics (Graphs) ---
// --- Analytics (Graphs) ---
router.get('/admin/analytics/transactions', async (req, res) => {
    const { period } = req.query; // 'weekly', 'monthly', 'yearly'
    const adminId = req.user.id;
    let query = '';
    let params = [adminId];

    try {
        if (period === 'weekly') {
            // Last 7 days
            query = `
                SELECT DATE_FORMAT(created_at, '%a') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual' 
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            `;
            if (req.query.router_id) {
                query += ' AND router_id = ?';
                params.push(req.query.router_id);
            }
            query += `
                GROUP BY DATE_FORMAT(created_at, '%a')
                ORDER BY MIN(created_at) ASC
            `;
        } else if (period === 'monthly') {
            // Last 30 days
            query = `
                SELECT DATE_FORMAT(created_at, '%d %b') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
            `;
            if (req.query.router_id) {
                query += ' AND router_id = ?';
                params.push(req.query.router_id);
            }
            query += `
                GROUP BY DATE_FORMAT(created_at, '%d %b')
                ORDER BY MIN(created_at) ASC
            `;
        } else if (period === 'yearly') {
            // Last 12 months
            query = `
                SELECT DATE_FORMAT(created_at, '%b %Y') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
                GROUP BY DATE_FORMAT(created_at, '%b %Y')
                ORDER BY MIN(created_at) ASC
            `;
        } else {
            return res.status(400).json({ error: 'Invalid period' });
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Analytics Error:', err); // Check PM2 logs for this
        res.status(500).json({ error: 'Failed to fetch analytics: ' + err.message });
    }
});

// --- Stats & Logs ---
router.get('/admin/stats', async (req, res) => {
    try {
        const { router_id } = req.query;
        const adminId = req.user.id;

        let whereClause = "WHERE admin_id = ? AND (status = 'success' OR status = 'SUCCESS') AND (transaction_ref NOT LIKE 'SMS-%' AND transaction_ref NOT LIKE 'SUB-%' AND transaction_ref NOT LIKE 'W-%')";
        const params = [adminId];

        if (router_id) {
            whereClause += " AND router_id = ?";
            params.push(router_id);
        }

        const statsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) as daily_revenue,
                COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN amount ELSE 0 END), 0) as weekly_revenue,
                COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount ELSE 0 END), 0) as monthly_revenue,
                COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) THEN amount ELSE 0 END), 0) as yearly_revenue,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN (amount - COALESCE(fee, 0)) ELSE 0 END), 0) as daily_net_revenue,
                COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN (amount - COALESCE(fee, 0)) ELSE 0 END), 0) as weekly_net_revenue,
                COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN (amount - COALESCE(fee, 0)) ELSE 0 END), 0) as monthly_net_revenue,
                COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) THEN (amount - COALESCE(fee, 0)) ELSE 0 END), 0) as yearly_net_revenue,
                COALESCE(SUM(amount), 0) as total_revenue,
                COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as net_revenue
            FROM transactions
            ${whereClause}
        `;

        let routerFilter = "";
        let countParams = [adminId];
        if (router_id) {
            routerFilter = " AND router_id = ?";
            countParams.push(router_id);
        }

        const [adminInfo] = await db.query('SELECT subscription_expiry, billing_type, COALESCE(opening_balance, 0.00) as opening_balance, last_settled_at FROM admins WHERE id = ?', [adminId]);
        const openingBalance = Number(adminInfo[0]?.opening_balance || 0);
        const lastSettledAt = adminInfo[0]?.last_settled_at || '1970-01-01 00:00:00';

        const [
            [transStats],
            [onlineTrans],
            [agentTrans],
            [leaderboard],
            [withdrawStats],
            [pendingWdStats],
            [catCount],
            [pkgCount],
            [voucherCount],
            [boughtCount],
            [paymentCount],
            [smsBalRows]
        ] = await Promise.all([
            db.query(statsQuery, params),
            db.query(`
                SELECT 
                    COALESCE(SUM(amount), 0) as total_revenue,
                    COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as net_revenue
                FROM transactions
                ${whereClause} AND (payment_method IS NULL OR payment_method != 'cash_agent') AND created_at >= ?
            `, [...params, lastSettledAt]),
            db.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) as daily_agent_sales,
                    COALESCE(SUM(amount), 0) as total_agent_sales,
                    COUNT(*) as agent_sales_count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method = 'cash_agent'
            `, [adminId]),
            db.query(`
                SELECT 
                    a.id,
                    a.username,
                    a.email,
                    a.phone_number,
                    COALESCE(SUM(CASE WHEN t.status = 'success' THEN t.amount ELSE 0 END), 0) as total_sales,
                    COUNT(CASE WHEN t.status = 'success' THEN t.id ELSE NULL END) as vouchers_sold
                FROM agents a
                LEFT JOIN transactions t ON t.agent_id = a.id
                WHERE a.admin_id = ?
                GROUP BY a.id
                ORDER BY total_sales DESC, vouchers_sold DESC
                LIMIT 10
            `, [adminId]),
            db.query('SELECT COALESCE(SUM(amount), 0) as total_withdrawn FROM withdrawals WHERE admin_id = ? AND status = "success" AND created_at >= ?', [adminId, lastSettledAt]),
            db.query('SELECT COALESCE(SUM(amount), 0) as pending_withdrawn FROM withdrawals WHERE admin_id = ? AND status = "pending" AND created_at >= ?', [adminId, lastSettledAt]),
            db.query(`SELECT count(*) as count FROM categories WHERE admin_id = ?${routerFilter}`, countParams),
            db.query(`SELECT count(*) as count FROM packages WHERE admin_id = ?${routerFilter}`, countParams),
            db.query(`
                SELECT count(*) as count FROM vouchers v 
                LEFT JOIN packages p ON v.package_id = p.id 
                WHERE (p.admin_id = ? OR v.admin_id = ?) AND (v.is_used = 0 OR v.is_used IS NULL)
            `, [adminId, adminId]),
            db.query(`
                SELECT count(*) as count FROM transactions 
                WHERE admin_id = ? AND status = 'success' AND transaction_ref NOT LIKE 'SMS-%'${routerFilter}
            `, countParams),
            db.query(`
                SELECT count(*) as count FROM transactions 
                WHERE admin_id = ? AND status = 'success'${routerFilter}
            `, countParams),
            db.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [adminId])
        ]);

        const grossRevenue = Number(transStats[0].total_revenue);
        const netRevenue = Number(transStats[0].net_revenue);
        const onlineNetRevenue = Number(onlineTrans[0].net_revenue);
        const agentCashRevenue = Number(agentTrans[0].total_agent_sales);
        const totalWithdrawn = Number(withdrawStats[0].total_withdrawn);
        const pendingWithdrawn = Number(pendingWdStats[0].pending_withdrawn);
        
        // Withdrawable balance is Opening Baseline Balance + Online Net Revenue (amount - fee) minus (Success + Pending Withdrawals since settlement)
        const withdrawableBalance = openingBalance + onlineNetRevenue - (totalWithdrawn + pendingWithdrawn);

        // Net Revenue Breakdown
        const netDailyRev = Number(transStats[0]?.daily_net_revenue || 0);
        const netWeeklyRev = Number(transStats[0]?.weekly_net_revenue || 0);
        const netMonthlyRev = Number(transStats[0]?.monthly_net_revenue || 0);
        const netYearlyRev = Number(transStats[0]?.yearly_net_revenue || 0);

        // 3. SMS Balance & Active Sessions
        const smsBalance = Number(smsBalRows[0]?.balance || 0);

        res.json({
            revenue: {
                today: netDailyRev,
                this_week: netWeeklyRev,
                this_month: netMonthlyRev,
                this_year: netYearlyRev,
                total: netRevenue,
                gross_total: grossRevenue
            },
            finance: {
                ...transStats[0],
                total_balance: withdrawableBalance > 0 ? withdrawableBalance : 0,
                gross_revenue: grossRevenue,
                net_revenue: netRevenue,
                net_balance: withdrawableBalance > 0 ? withdrawableBalance : 0,
                withdrawable_balance: withdrawableBalance > 0 ? withdrawableBalance : 0,
                online_net_revenue: onlineNetRevenue,
                agent_cash_total: agentCashRevenue,
                agent_cash_today: Number(agentTrans[0].daily_agent_sales),
                agent_sales_count: Number(agentTrans[0].agent_sales_count),
                total_withdrawn: totalWithdrawn,
                pending_withdrawals: pendingWithdrawn
            },
            agent_leaderboard: leaderboard,
            sms_balance: smsBalance > 0 ? smsBalance : 0,
            counts: {
                categories_count: catCount[0].count,
                packages_count: pkgCount[0].count,
                vouchers_count: voucherCount[0].count,
                bought_vouchers_count: boughtCount[0].count,
                payments_count: paymentCount[0].count,
                clients: boughtCount[0].count
            },
            subscription: {
                expiry: adminInfo[0]?.subscription_expiry,
                billing_type: adminInfo[0]?.billing_type || 'commission',
                commission_rate: adminInfo[0]?.commission_rate !== undefined && adminInfo[0]?.commission_rate !== null ? adminInfo[0]?.commission_rate : 5.00
            }
        });
    } catch (err) {
        console.error('Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

router.get('/admin/payments-chart', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const adminId = req.user.id;

        const [rows] = await db.query(`
            SELECT MONTH(created_at) as month_num, COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE admin_id = ? 
              AND (status = 'success' OR status = 'SUCCESS')
              AND YEAR(created_at) = ?
              AND transaction_ref NOT LIKE 'SMS-%' 
              AND transaction_ref NOT LIKE 'SUB-%' 
              AND transaction_ref NOT LIKE 'W-%'
            GROUP BY MONTH(created_at)
        `, [adminId, year]);

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const chartData = months.map((m, idx) => {
            const match = rows.find(r => r.month_num === (idx + 1));
            return {
                month: m,
                total: match ? Number(match.total) : 0
            };
        });

        res.json(chartData);
    } catch (err) {
        console.error('Payments Chart Error:', err);
        res.status(500).json({ error: 'Failed to fetch payments chart data' });
    }
});

router.get('/admin/active-users-chart', async (req, res) => {
    try {
        const days = parseInt(req.query.days, 10) || 7;

        // 1. Live Active Sessions right now for this tenant
        const [[activeRow]] = await db.query(`
            SELECT COUNT(DISTINCT a.username) as active_now
            FROM radacct a
            LEFT JOIN routers r ON (a.nasipaddress = r.ip_address)
            LEFT JOIN vouchers v ON v.code = a.username
            LEFT JOIN packages p ON p.id = v.package_id
            WHERE a.acctstoptime IS NULL
              AND (v.expires_at IS NULL OR v.expires_at > NOW())
              AND (r.admin_id = ? OR v.admin_id = ? OR p.admin_id = ?)
        `, [req.user.id, req.user.id, req.user.id]);

        // 2. Query daily active session counts from radacct strictly for this tenant (using local date string format)
        const [rows] = await db.query(`
            SELECT DATE_FORMAT(a.acctstarttime, '%Y-%m-%d') as date_str, COUNT(DISTINCT a.username) as user_count
            FROM radacct a
            LEFT JOIN routers r ON (a.nasipaddress = r.ip_address)
            LEFT JOIN vouchers v ON v.code = a.username
            LEFT JOIN packages p ON p.id = v.package_id
            WHERE a.acctstarttime >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
              AND (r.admin_id = ? OR v.admin_id = ? OR p.admin_id = ?)
            GROUP BY DATE_FORMAT(a.acctstarttime, '%Y-%m-%d')
            ORDER BY DATE_FORMAT(a.acctstarttime, '%Y-%m-%d') ASC
        `, [days, req.user.id, req.user.id, req.user.id]);

        // Generate date array for last N days (local YYYY-MM-DD format to prevent UTC offset shifting)
        const chartData = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

            const match = rows.find(r => String(r.date_str) === dateStr);

            chartData.push({
                date: dayName,
                users: match ? Number(match.user_count) : 0
            });
        }

        const userCounts = chartData.map(c => c.users);
        const peak = Math.max(...userCounts, 0);
        const totalSum = userCounts.reduce((a, b) => a + b, 0);
        const avg = chartData.length > 0 ? Math.round(totalSum / chartData.length) : 0;

        res.json({
            active_now: Number(activeRow?.active_now || 0),
            average: avg,
            peak: peak,
            chart: chartData
        });
    } catch (err) {
        console.error('Active Users Chart Error:', err);
        res.status(500).json({ error: 'Failed to fetch active users chart data' });
    }
});

// SMS Balance (Mock or Real)
router.get('/admin/sms-balance', async (req, res) => {
    try {
        // Retrieve balance from Relworx or mocked
        // For now, return 0 or fetch from admins table if column exists.
        // Returning 0 to prevent crash. User can request full implementation later.
        res.json({ balance: 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch SMS balance' });
    }
});

// SMS Logs
router.get('/admin/sms-logs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM sms_logs WHERE admin_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});


// --- Subscription Renewal ---
router.get('/admin/subscription/history', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM admin_subscriptions WHERE admin_id = ? ORDER BY created_at DESC LIMIT 100',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch Subscription History Error:', err);
        res.status(500).json({ error: 'Failed to fetch subscription history' });
    }
});

router.post('/admin/renew-subscription', async (req, res) => {
    const { phone_number, months } = req.body;

    if (!phone_number) return res.status(400).json({ error: 'Phone number is required' });
    const numMonths = parseInt(months, 10);
    if (isNaN(numMonths) || numMonths < 1) return res.status(400).json({ error: 'Invalid duration' });

    // Enforce Pricing Server-Side
    const MONTHLY_FEE = 20000;
    const amount = numMonths * MONTHLY_FEE;

    try {
        // Format Phone
        let formattedPhone = phone_number.trim();
        if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

        const reference = `SUB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        console.log(`[SUBSCRIPTION] Initiating for ${formattedPhone}, Months: ${numMonths}, Amount: ${amount}, Ref: ${reference}`);

        // 1. Insert Pending Record
        await db.query(`
            INSERT INTO admin_subscriptions
            (admin_id, amount, months, phone_number, status, reference)
            VALUES (?, ?, ?, ?, 'pending', ?)
        `, [req.user.id, amount, numMonths, formattedPhone, reference]);

        // 2. Call Relworx
        const response = await fetch(RELWORX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            },
            body: JSON.stringify({
                account_no: RELWORX_ACCOUNT_NO,
                reference: reference,
                msisdn: formattedPhone,
                currency: 'UGX',
                amount: Number(amount),
                description: `Subscription Renewal (${numMonths} months)`
            })
        });

        const paymentData = await response.json();
        console.log(`[SUBSCRIPTION] Gateway Response:`, JSON.stringify(paymentData));

        if (response.ok) {
            res.json({
                message: 'Payment request initiated.',
                status: 'pending',
                reference: reference
            });
        } else {
            console.error(`[SUBSCRIPTION] Gateway Failed:`, paymentData);
            await db.query('UPDATE admin_subscriptions SET status = "failed" WHERE reference = ?', [reference]);
            res.status(400).json({ error: paymentData.message || paymentData.error || 'Payment gateway failed', details: paymentData });
        }
    } catch (err) {
        console.error('Subscription Error:', err);
        res.status(500).json({ error: 'Failed to process subscription' });
    }
});

router.get('/admin/subscription-status/:reference', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT status, months FROM admin_subscriptions WHERE reference = ? AND admin_id = ?', [req.params.reference, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        const localStatus = rows[0].status;
        const monthsToAdd = rows[0].months;

        if (localStatus === 'success' || localStatus === 'failed') {
            return res.json({ status: localStatus });
        }

        // Poll Gateway
        const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${req.params.reference}&internal_reference=${req.params.reference}`;

        console.log(`[SUBSCRIPTION-POLL] Checking: ${req.params.reference}`);

        const gwRes = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            }
        });

        if (!gwRes.ok) return res.json({ status: 'pending' });

        const gwData = await gwRes.json();
        const gwStatus = (gwData.status || '').toUpperCase();
        const itemStatus = (gwData.item_status || '').toUpperCase();

        if (gwStatus === 'SUCCESS' || itemStatus === 'SUCCESS') {
            console.log(`[SUBSCRIPTION] Confirmed Success: ${req.params.reference}`);
            await db.query('UPDATE admin_subscriptions SET status = "success" WHERE reference = ?', [req.params.reference]);

            // Update Admin Expiry
            // We need to fetch current expiry first to add time correctly
            const [adminRows] = await db.query('SELECT subscription_expiry FROM admins WHERE id = ?', [req.user.id]);
            let currentExpiry = adminRows[0].subscription_expiry ? new Date(adminRows[0].subscription_expiry) : new Date();
            const now = new Date();

            // If expired, start from NOW. If active, add to current expiry.
            if (currentExpiry < now) currentExpiry = now;

            currentExpiry.setMonth(currentExpiry.getMonth() + monthsToAdd);

            await db.query('UPDATE admins SET subscription_expiry = ? WHERE id = ?', [currentExpiry, req.user.id]);

            return res.json({ status: 'success' });
        } else if (gwStatus === 'FAILED') {
            await db.query('UPDATE admin_subscriptions SET status = "failed" WHERE reference = ?', [req.params.reference]);
            return res.json({ status: 'failed' });
        }

        res.json({ status: 'pending' });

    } catch (err) {
        console.error('Check Subscription Status Error:', err);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// --- Web Configs (Branding) ---
router.get('/admin/web-configs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT business_name, business_phone, portal_dns, portal_welcome_msg, terms_text, portal_logo FROM admins WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Web Configs Error:', err);
        res.status(500).json({ error: 'Failed to fetch web configs' });
    }
});

router.put('/admin/web-configs', async (req, res) => {
    const { business_name, business_phone, portal_dns, portal_welcome_msg, terms_text } = req.body;
    try {
        await db.query(
            'UPDATE admins SET business_name = ?, business_phone = ?, portal_dns = ?, portal_welcome_msg = ?, terms_text = ? WHERE id = ?',
            [business_name || null, business_phone || null, portal_dns || null, portal_welcome_msg || null, terms_text || null, req.user.id]
        );
        res.json({ message: 'Web configs updated' });
    } catch (err) {
        console.error('Update Web Configs Error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ error: 'Domain already taken' });
        }
        res.status(500).json({ error: 'Failed to update web configs' });
    }
});

router.post('/admin/web-configs/logo', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const ext = path.extname(req.file.originalname);
        const newName = `logo_${req.user.id}_${Date.now()}${ext}`;
        // Multer dest is 'uploads/', __dirname is src/routes.
        const newPath = path.join(__dirname, '../../uploads', newName);
        fs.renameSync(req.file.path, newPath);
        
        const logo_url = `/uploads/${newName}`;
        await db.query('UPDATE admins SET portal_logo = ? WHERE id = ?', [logo_url, req.user.id]);
        
        res.json({ logo_url });
    } catch (err) {
        console.error('Upload Logo Error:', err);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// --- Portal Ads ---
router.get('/admin/portal-ads', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM portal_ads WHERE admin_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch Portal Ads Error:', err);
        res.status(500).json({ error: 'Failed to fetch portal ads' });
    }
});

router.post('/admin/portal-ads/upload', upload.single('file'), async (req, res) => {
    const { title, link_url } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const ext = path.extname(req.file.originalname);
        const newName = `ad_${req.user.id}_${Date.now()}${ext}`;
        const newPath = path.join(__dirname, '../../uploads', newName);
        fs.renameSync(req.file.path, newPath);

        const image_url = `/uploads/${newName}`;
        const [result] = await db.query(
            'INSERT INTO portal_ads (admin_id, title, image_url, link_url, is_active) VALUES (?, ?, ?, ?, 1)',
            [req.user.id, title, image_url, link_url || null]
        );

        res.json({
            id: result.insertId,
            title,
            image_url,
            link_url: link_url || null,
            is_active: true,
            message: 'Portal ad uploaded successfully'
        });
    } catch (err) {
        console.error('Upload Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to upload portal ad' });
    }
});

router.patch('/admin/portal-ads/:id/toggle', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT is_active FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });

        const newState = rows[0].is_active ? 0 : 1;
        await db.query(
            'UPDATE portal_ads SET is_active = ? WHERE id = ?',
            [newState, req.params.id]
        );

        res.json({ is_active: newState, message: 'Ad status updated successfully' });
    } catch (err) {
        console.error('Toggle Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to toggle ad status' });
    }
});

router.delete('/admin/portal-ads/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT image_url FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });

        const imagePath = path.join(__dirname, '../..', rows[0].image_url);
        fs.unlink(imagePath, (err) => {
            if (err) console.warn('Could not delete image file:', err.message);
        });

        await db.query(
            'DELETE FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );

        res.json({ message: 'Portal ad deleted successfully' });
    } catch (err) {
        console.error('Delete Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to delete portal ad' });
    }
});

// --- Agent Management for Admin ---
router.get('/admin/agents', async (req, res) => {
    try {
        const adminId = req.user.id;
        const [agents] = await db.query(`
            SELECT 
                a.id, a.username, a.email, a.phone_number, a.phone_number as business_phone, a.created_at,
                COALESCE(v.stock_count, 0) as stock_count,
                COALESCE(t.total_sales, 0) as total_sales,
                COALESCE(u.unsettled_amount, 0) as unsettled_amount
            FROM agents a
            LEFT JOIN (
                SELECT agent_id, COUNT(*) as stock_count 
                FROM vouchers 
                WHERE (is_used = 0 OR is_used IS NULL) 
                GROUP BY agent_id
            ) v ON a.id = v.agent_id
            LEFT JOIN (
                SELECT agent_id, SUM(amount) as total_sales 
                FROM transactions 
                WHERE status = 'success' 
                GROUP BY agent_id
            ) t ON a.id = t.agent_id
            LEFT JOIN (
                SELECT agent_id, SUM(amount) as unsettled_amount 
                FROM transactions 
                WHERE status = 'success' AND (is_settled = 0 OR is_settled IS NULL)
                GROUP BY agent_id
            ) u ON a.id = u.agent_id
            WHERE a.admin_id = ?
            ORDER BY a.created_at DESC
        `, [adminId]);

        res.json(agents);
    } catch (err) {
        console.error('Fetch Admin Agents Error:', err);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
});

router.post('/admin/agents', async (req, res) => {
    const { username, password, email, phone_number, business_phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const finalPhone = phone_number || business_phone || null;

    try {
        const [existing] = await db.query('SELECT id FROM agents WHERE username = ?', [username]);
        if (existing.length > 0) return res.status(400).json({ error: 'Username already taken' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await db.query(
            'INSERT INTO agents (admin_id, username, password_hash, email, phone_number) VALUES (?, ?, ?, ?, ?)',
            [req.user.id, username, hash, email || null, finalPhone]
        );

        req.io.emit('data_update', { type: 'agents' });
        res.status(201).json({ message: 'Agent created successfully' });
    } catch (err) {
        console.error('Create Agent Error:', err);
        res.status(500).json({ error: 'Failed to create agent: ' + err.message });
    }
});

router.put('/admin/agents/:id', async (req, res) => {
    const { password, email, phone_number, business_phone } = req.body;
    const finalPhone = phone_number || business_phone || null;

    try {
        if (password && password.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            await db.query(
                'UPDATE agents SET password_hash = ?, email = ?, phone_number = ? WHERE id = ? AND admin_id = ?',
                [hash, email || null, finalPhone, req.params.id, req.user.id]
            );
        } else {
            await db.query(
                'UPDATE agents SET email = ?, phone_number = ? WHERE id = ? AND admin_id = ?',
                [email || null, finalPhone, req.params.id, req.user.id]
            );
        }

        req.io.emit('data_update', { type: 'agents' });
        res.json({ message: 'Agent updated successfully' });
    } catch (err) {
        console.error('Update Agent Error:', err);
        res.status(500).json({ error: 'Failed to update agent: ' + err.message });
    }
});

router.delete('/admin/agents/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM agents WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        req.io.emit('data_update', { type: 'agents' });
        res.json({ message: 'Agent deleted successfully' });
    } catch (err) {
        console.error('Delete Agent Error:', err);
        res.status(500).json({ error: 'Failed to delete agent: ' + err.message });
    }
});

module.exports = router;
