const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sessionStore = require('../config/session');
const { syncVoucherToRadius } = require('../utils/radius');


// Helper to resolve admin_id from slug, hostname, or query parameters
async function resolveAdmin(req) {
    const slug = req.query.slug || (req.body && req.body.slug);

    // 1. Resolve by slug (admin portal_slug or router slug)
    if (slug) {
        const [rows] = await db.query('SELECT id FROM admins WHERE portal_slug = ?', [slug]);
        if (rows.length > 0) return rows[0].id;

        const [routerRows] = await db.query('SELECT admin_id FROM routers WHERE slug = ? OR portal_slug = ?', [slug, slug]);
        if (routerRows.length > 0) return routerRows[0].admin_id;
    }

    // 2. Resolve by Host Header / portal_dns
    const host = req.headers.host;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.includes('localhost:')) {
        const domain = host.split(':')[0].toLowerCase();
        const [rows] = await db.query('SELECT id FROM admins WHERE LOWER(portal_dns) = ? AND role = "admin"', [domain]);
        if (rows.length > 0) return rows[0].id;
    }

    return null;
}

router.get('/debug-balances', async (req, res) => {
    try {
        const [admins] = await db.query('SELECT id, username, billing_type FROM admins WHERE id IN (54, 52)');
        const [transactions] = await db.query('SELECT id, admin_id, transaction_ref, phone_number, amount, fee, status, payment_method, created_at FROM transactions WHERE admin_id IN (54, 52)');
        const [withdrawals] = await db.query('SELECT id, admin_id, reference, amount, status, created_at FROM withdrawals WHERE admin_id IN (54, 52)');
        res.json({ admins, transactions, withdrawals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Branding Info (Public)
router.get('/branding', async (req, res) => {
    try {
        const admin_id = await resolveAdmin(req);
        if (!admin_id) {
            return res.json({ name: 'UGPAY', phone: '', portal_dns: '', portal_logo: '', portal_welcome_msg: '', terms_text: '' });
        }

        const [rows] = await db.query('SELECT business_name, business_phone, portal_dns, portal_logo, portal_welcome_msg, terms_text FROM admins WHERE id = ?', [admin_id]);

        if (rows.length === 0) {
            return res.json({ name: 'UGPAY', phone: '', portal_dns: '', portal_logo: '', portal_welcome_msg: '', terms_text: '' });
        }

        res.json({
            name: rows[0].business_name || 'UGPAY',
            phone: rows[0].business_phone || '',
            portal_dns: rows[0].portal_dns || '',
            portal_logo: rows[0].portal_logo || '',
            portal_welcome_msg: rows[0].portal_welcome_msg || '',
            terms_text: rows[0].terms_text || ''
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch branding' });
    }
});

// Get Active Portal Ads (Public)
router.get('/public/portal-ads', async (req, res) => {
    try {
        const admin_id = await resolveAdmin(req);
        if (!admin_id) return res.json([]);

        const [rows] = await db.query('SELECT title, image_url, link_url FROM portal_ads WHERE admin_id = ? AND is_active = 1 ORDER BY created_at DESC', [admin_id]);
        res.json(rows);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch portal ads' });
    }
});

// Get Packages (Public/Captive Portal)
router.get('/packages', async (req, res) => {
    try {
        const admin_id = await resolveAdmin(req);
        if (!admin_id) return res.json([]);

        let query = `
            SELECT p.id, p.name, p.price, p.validity_hours AS duration_hours
            FROM packages p
            JOIN admins a ON p.admin_id = a.id
            WHERE p.admin_id = ?
            AND p.is_active = 1
            AND (a.billing_type != 'subscription' OR a.subscription_expiry > NOW() OR a.subscription_expiry IS NULL)
            ORDER BY p.price ASC
        `;

        const [rows] = await db.query(query, [admin_id]);
        res.json(rows);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

// Connect / Check Status
router.post('/connect', (req, res) => {
    const { phone_number } = req.body;

    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const session = sessionStore.get(phone_number);

    if (session && session.expiry > Date.now()) {
        return res.json({
            status: 'connected',
            redirect_url: 'https://www.google.com'
        });
    } else {
        return res.json({
            status: 'pending_payment',
            message: 'Your session has expired or payment is still processing.'
        });
    }
});

// Validate Voucher Status & Device Limits for Captive Portal
router.post('/validate-voucher', async (req, res) => {
    const { voucher_code, calling_station_id } = req.body;
    if (!voucher_code || !voucher_code.trim()) {
        return res.status(400).json({ valid: false, error: 'Voucher code is required' });
    }

    const code = voucher_code.trim();

    try {
        const resolvedAdminId = await resolveAdmin(req);

        // Fetch voucher details & package simultaneous devices limit
        let query = `
            SELECT v.id, v.code, v.status, v.is_used, v.first_used_at, v.expires_at, v.package_id,
                   COALESCE(p.simultaneous_devices, 1) as max_devices,
                   p.validity_hours, p.validity_minutes, p.validity_unit,
                   p.name as package_name
            FROM vouchers v
            LEFT JOIN packages p ON p.id = v.package_id
            WHERE (v.code = ? OR v.code = LOWER(?) OR v.code = UPPER(?))
        `;
        let params = [code, code, code];

        if (resolvedAdminId) {
            query += ' AND (v.admin_id = ? OR p.admin_id = ?)';
            params.push(resolvedAdminId, resolvedAdminId);
        }

        query += ' ORDER BY v.id DESC LIMIT 1';

        const [rows] = await db.query(query, params);

        if (rows.length === 0) {
            return res.json({ valid: false, error: 'Invalid voucher code. Please check and try again.' });
        }

        const voucher = rows[0];

        // Guarantee RADIUS sync in radcheck before client attempts hotspot login
        if (voucher.package_id) {
            await syncVoucherToRadius(voucher.code, voucher.package_id).catch(() => {});
        }

        // Check if voucher status is explicitly expired or past expiration date
        if (voucher.status === 'expired' || (voucher.expires_at && new Date(voucher.expires_at) <= new Date())) {
            return res.json({ valid: false, error: 'This voucher has expired and cannot be used again.' });
        }

        // Check if cumulative usage has reached package duration
        const [acctUsage] = await db.query(`
            SELECT COALESCE(SUM(acctsessiontime), 0) as total_used
            FROM radacct
            WHERE username = ?
        `, [code]);

        const totalUsedSec = Number(acctUsage[0]?.total_used || 0);
        let maxAllowedSec = 0;
        if (voucher.validity_unit === 'minutes' && voucher.validity_minutes > 0) {
            maxAllowedSec = voucher.validity_minutes * 60;
        } else if (voucher.validity_hours > 0) {
            maxAllowedSec = voucher.validity_hours * 3600;
        } else if (voucher.validity_minutes > 0) {
            maxAllowedSec = voucher.validity_minutes * 60;
        }

        if (maxAllowedSec > 0 && totalUsedSec >= maxAllowedSec) {
            // Mark voucher as expired in database & purge RADIUS
            await db.query("UPDATE vouchers SET status = 'expired', is_used = 1 WHERE id = ?", [voucher.id]).catch(() => {});
            await db.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'", [code]).catch(() => {});
            await db.query("DELETE FROM radreply WHERE username = ?", [code]).catch(() => {});
            return res.json({ valid: false, error: 'This voucher has reached its full duration limit and is deactivated.' });
        }

        // Check active sessions in radacct
        const [activeSessions] = await db.query(`
            SELECT COUNT(DISTINCT callingstationid) as device_count,
                   GROUP_CONCAT(DISTINCT callingstationid) as active_macs
            FROM radacct
            WHERE username = ? AND acctstoptime IS NULL
        `, [code]);

        const currentDevices = Number(activeSessions[0]?.device_count || 0);
        const activeMacs = activeSessions[0]?.active_macs ? activeSessions[0].active_macs.split(',') : [];

        // If caller MAC is already one of the active sessions, allow reconnection on same device
        const isSameDevice = calling_station_id && activeMacs.includes(calling_station_id);

        if (!isSameDevice && currentDevices >= voucher.max_devices) {
            return res.json({ 
                valid: false, 
                error: `This voucher is currently in use on another device (Limit: ${voucher.max_devices} device${voucher.max_devices > 1 ? 's' : ''}).` 
            });
        }

        return res.json({ valid: true });
    } catch (err) {
        console.error('Validate Voucher Error:', err);
        return res.json({ valid: true });
    }
});

// Find Lost Voucher Code by Transaction ID, Gateway Reference or Phone Number
router.post('/find-voucher', async (req, res) => {
    const { query } = req.body;
    if (!query || !query.trim()) {
        return res.status(400).json({ success: false, error: 'Transaction ID, Reference or Phone is required' });
    }

    const searchTerm = query.trim();
    const formattedPhone = formatUgandaMSISDN(searchTerm);

    try {
        const resolvedAdminId = await resolveAdmin(req);

        let sql = `
            SELECT t.id, t.transaction_ref, t.gateway_ref, t.voucher_code, t.status, t.package_id, t.created_at,
                   p.name as package_name, p.admin_id, t.router_id
            FROM transactions t
            LEFT JOIN packages p ON p.id = t.package_id
            WHERE (t.transaction_ref = ? OR t.gateway_ref = ? OR t.voucher_code = ? OR t.transaction_ref LIKE CONCAT('%', ?, '%')
        `;
        let params = [searchTerm, searchTerm, searchTerm, searchTerm];

        if (formattedPhone) {
            sql += ' OR t.phone_number = ?';
            params.push(formattedPhone);
        }

        sql += ')';

        // STRICT TENANT ISOLATION: Restrict searches strictly to the current admin portal
        if (resolvedAdminId) {
            sql += ' AND (t.admin_id = ? OR p.admin_id = ?)';
            params.push(resolvedAdminId, resolvedAdminId);
        }

        sql += ' ORDER BY t.id DESC LIMIT 1';

        const [rows] = await db.query(sql, params);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No voucher found for this portal.' });
        }

        const tx = rows[0];

        // If voucher code already exists on transaction
        if (tx.voucher_code) {
            if (tx.package_id) {
                await syncVoucherToRadius(tx.voucher_code, tx.package_id).catch(() => {});
            }
            return res.json({
                success: true,
                voucher_code: tx.voucher_code,
                package_name: tx.package_name || 'Internet Package',
                status: tx.status
            });
        }

        // If transaction status is success but voucher_code was NULL, assign or generate one
        if (tx.status === 'success' || tx.status === 'SUCCESS') {
            const [vouchers] = await db.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE LIMIT 1', [tx.package_id]);
            let assignedCode = '';

            if (vouchers.length > 0) {
                assignedCode = vouchers[0].code;
                await db.query('UPDATE vouchers SET is_used = TRUE WHERE id = ?', [vouchers[0].id]);
            } else {
                const crypto = require('crypto');
                assignedCode = 'V' + crypto.randomBytes(4).toString('hex').toUpperCase();
                await db.query(
                    'INSERT INTO vouchers (code, package_id, is_used, admin_id, router_id) VALUES (?, ?, TRUE, ?, ?)',
                    [assignedCode, tx.package_id, tx.admin_id, tx.router_id || null]
                );
            }

            await db.query('UPDATE transactions SET voucher_code = ? WHERE id = ?', [assignedCode, tx.id]);
            await syncVoucherToRadius(assignedCode, tx.package_id).catch(() => {});

            return res.json({
                success: true,
                voucher_code: assignedCode,
                package_name: tx.package_name || 'Internet Package',
                status: 'success'
            });
        }

        return res.status(400).json({
            success: false,
            message: `Transaction status is '${tx.status}'. If you paid, please wait a moment and try again.`
        });

    } catch (err) {
        console.error('Find Voucher Error:', err);
        return res.status(500).json({ success: false, error: 'Server error retrieving voucher' });
    }
});

module.exports = router;


