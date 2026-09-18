const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sessionStore = require('../config/session');
const { syncVoucherToRadius } = require('../utils/radius');


// Helper to format Ugandan phone numbers
function formatUgandaMSISDN(phone) {
    if (!phone) return null;
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('256')) return clean;
    if (clean.startsWith('0')) return '256' + clean.slice(1);
    if (clean.length === 9) return '256' + clean;
    return clean;
}

// Helper to generate phone number variations to match all potential DB formats (+256..., 256..., 0..., 7...)
function getPhoneVariations(phoneInput) {
    if (!phoneInput) return [];
    const str = phoneInput.toString().trim();
    const clean = str.replace(/[^0-9]/g, '');
    if (!clean) return [str];

    let base9 = '';
    if (clean.startsWith('256') && clean.length >= 12) {
        base9 = clean.slice(3);
    } else if (clean.startsWith('0') && clean.length >= 10) {
        base9 = clean.slice(1);
    } else if (clean.length === 9) {
        base9 = clean;
    }

    if (base9 && base9.length === 9) {
        const set = new Set([
            `+256${base9}`,
            `256${base9}`,
            `0${base9}`,
            base9,
            str,
            clean
        ]);
        return Array.from(set);
    }

    const set = new Set([str, clean]);
    return Array.from(set);
}

// Helper to resolve admin_id from slug, hostname, or query parameters
async function resolveAdmin(req, fallbackToDefault = true) {
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

    if (fallbackToDefault) {
        // 3. Fallback to primary admin in DB so branding/theme always resolves
        const [defaultAdmin] = await db.query('SELECT id FROM admins ORDER BY id ASC LIMIT 1');
        if (defaultAdmin.length > 0) return defaultAdmin[0].id;
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
            return res.json({ name: 'UGPAY', phone: '', portal_dns: '', portal_logo: '', portal_welcome_msg: '', terms_text: '', portal_theme: 'glass', primary_color: '#6366f1' });
        }

        const [rows] = await db.query(
            'SELECT business_name, business_phone, portal_dns, portal_logo, portal_welcome_msg, terms_text, portal_theme, primary_color FROM admins WHERE id = ?',
            [admin_id]
        );

        if (rows.length === 0) {
            return res.json({ name: 'UGPAY', phone: '', portal_dns: '', portal_logo: '', portal_welcome_msg: '', terms_text: '', portal_theme: 'glass', primary_color: '#6366f1' });
        }

        const user = rows[0];
        res.json({
            name: user.business_name || 'UGPAY',
            phone: user.business_phone || '',
            portal_dns: user.portal_dns || '',
            portal_logo: user.portal_logo || '',
            portal_welcome_msg: user.portal_welcome_msg || '',
            terms_text: user.terms_text || '',
            portal_theme: user.portal_theme || 'glass',
            primary_color: user.primary_color || '#6366f1'
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: err.message });
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
            SELECT p.id, p.name, p.price, p.validity_hours AS duration_hours, p.validity_minutes, p.validity_unit,
                   COALESCE(p.device_type, 'mobile') AS device_type
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

        // Check Admin Subscription Status: block NEW logins if expired, but preserve existing active sessions
        const adminCheckId = voucher.admin_id || resolvedAdminId;
        if (adminCheckId) {
            const [adminRows] = await db.query('SELECT billing_type, subscription_expiry FROM admins WHERE id = ?', [adminCheckId]);
            if (adminRows.length > 0) {
                const { billing_type, subscription_expiry } = adminRows[0];
                if (billing_type === 'subscription' && subscription_expiry && new Date(subscription_expiry) < new Date()) {
                    // Check if voucher has an existing active session
                    const [activeCheck] = await db.query(
                        'SELECT COUNT(*) as active_cnt FROM radacct WHERE username = ? AND acctstoptime IS NULL',
                        [code]
                    );
                    const isCurrentlyActive = activeCheck[0]?.active_cnt > 0;
                    if (!isCurrentlyActive) {
                        return res.json({
                            valid: false,
                            error: 'New logins are currently disabled due to an expired network subscription.'
                        });
                    }
                }
            }
        }

        // Guarantee RADIUS sync in radcheck before client attempts hotspot login
        if (voucher.package_id) {
            await syncVoucherToRadius(voucher.code, voucher.package_id).catch(() => {});
        }

        // Check if voucher status is explicitly expired, terminated, or past expiration date
        if (voucher.status === 'expired' || voucher.status === 'terminated' || (voucher.expires_at && new Date(voucher.expires_at) <= new Date())) {
            return res.json({ valid: false, error: 'This voucher has been terminated or expired and cannot be used again.' });
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

// Helper for finding/recovering vouchers by Phone, Ref, Gateway Ref, or Voucher Code
async function handleVoucherRecovery(req, isRecoverRoute = false) {
    const rawSearch = req.body.query || req.body.phone_number || req.body.search_term || req.query.query || req.query.phone_number || '';
    if (!rawSearch || !rawSearch.toString().trim()) {
        return { statusCode: 400, data: { success: false, error: 'Transaction ID, Reference or Phone is required' } };
    }

    const searchTerm = rawSearch.toString().trim();
    const phoneVariations = getPhoneVariations(searchTerm);
    const explicitAdminId = await resolveAdmin(req, false);
    const defaultAdminId = await resolveAdmin(req, true);

    const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;
    const RELWORX_API_KEY = process.env.RELWORX_API_KEY;

    let placeholders = phoneVariations.map(() => '?').join(',');
    let sql = `
        SELECT t.id, t.transaction_ref, t.gateway_ref, t.voucher_code, t.status, t.package_id, t.created_at, t.amount, t.phone_number,
               p.name as package_name, p.admin_id, t.router_id
        FROM transactions t
        LEFT JOIN packages p ON p.id = t.package_id
        WHERE (
            t.transaction_ref = ? 
            OR t.gateway_ref = ? 
            OR t.voucher_code = ? 
            OR t.phone_number IN (${placeholders})
            OR t.transaction_ref LIKE ?
            OR t.gateway_ref LIKE ?
        )
    `;

    let baseParams = [searchTerm, searchTerm, searchTerm, ...phoneVariations, `%${searchTerm}%`, `%${searchTerm}%`];

    let rows = [];
    if (explicitAdminId) {
        const scopedSql = sql + ` AND (t.admin_id = ? OR p.admin_id = ?) 
            ORDER BY 
                CASE 
                    WHEN (t.status = 'success' OR t.status = 'SUCCESS') AND t.voucher_code IS NOT NULL AND t.voucher_code != '' THEN 1 
                    WHEN (t.status = 'success' OR t.status = 'SUCCESS') THEN 2 
                    WHEN t.status = 'pending' THEN 3 
                    ELSE 4 
                END ASC, 
                t.id DESC LIMIT 10`;
        const scopedParams = [...baseParams, explicitAdminId, explicitAdminId];
        [rows] = await db.query(scopedSql, scopedParams);
    }

    if (rows.length === 0) {
        const unscopedSql = sql + ` ORDER BY 
            CASE 
                WHEN (t.status = 'success' OR t.status = 'SUCCESS') AND t.voucher_code IS NOT NULL AND t.voucher_code != '' THEN 1 
                WHEN (t.status = 'success' OR t.status = 'SUCCESS') THEN 2 
                WHEN t.status = 'pending' THEN 3 
                ELSE 4 
            END ASC, 
            t.id DESC LIMIT 10`;
        [rows] = await db.query(unscopedSql, baseParams);
    }

    if (rows.length === 0) {
        return { statusCode: 404, data: isRecoverRoute ? [] : { success: false, message: 'No voucher found for this phone number or reference.' } };
    }

    // Process candidate transactions to resolve pending status or assign missing codes
    for (let tx of rows) {
        // If pending, check with Relworx gateway proactively
        if (tx.status === 'pending' && RELWORX_ACCOUNT_NO && RELWORX_API_KEY && tx.transaction_ref) {
            try {
                const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${tx.transaction_ref}&internal_reference=${tx.transaction_ref}`;
                const response = await fetch(checkUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/vnd.relworx.v2',
                        'Authorization': `Bearer ${RELWORX_API_KEY}`
                    }
                });
                const gwData = await response.json();
                const status = (gwData.status || gwData.item_status || '').toUpperCase();
                if (status === 'SUCCESS') {
                    const gatewayRef = gwData.provider_reference || gwData.financial_transaction_id || gwData.financial_ref || gwData.operator_id || null;
                    await db.query('UPDATE transactions SET status = "success", gateway_ref = COALESCE(?, gateway_ref) WHERE id = ?', [gatewayRef, tx.id]);
                    tx.status = 'success';
                } else if (status === 'FAILED') {
                    await db.query('UPDATE transactions SET status = "failed" WHERE id = ?', [tx.id]);
                    tx.status = 'failed';
                }
            } catch (gwErr) {
                console.error('[VOUCHER RECOVERY] Relworx check error:', gwErr);
            }
        }

        // If success but no voucher code assigned yet
        if ((tx.status === 'success' || tx.status === 'SUCCESS') && !tx.voucher_code) {
            const adminId = tx.admin_id || defaultAdminId;
            const [vouchers] = await db.query(
                'SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE AND (status IS NULL OR status != "expired") ORDER BY id ASC LIMIT 1',
                [tx.package_id]
            );

            let assignedCode = '';
            if (vouchers.length > 0) {
                assignedCode = vouchers[0].code;
                await db.query('UPDATE vouchers SET is_used = TRUE, status = "active" WHERE id = ?', [vouchers[0].id]);
            } else {
                const crypto = require('crypto');
                assignedCode = 'V' + crypto.randomBytes(4).toString('hex').toUpperCase();
                await db.query(
                    'INSERT INTO vouchers (code, package_id, is_used, admin_id, router_id, status) VALUES (?, ?, TRUE, ?, ?, "active")',
                    [assignedCode, tx.package_id, adminId, tx.router_id || null]
                );
            }

            await db.query('UPDATE transactions SET voucher_code = ? WHERE id = ?', [assignedCode, tx.id]);
            tx.voucher_code = assignedCode;
        }

        // Sync to RADIUS
        if (tx.voucher_code && tx.package_id) {
            await syncVoucherToRadius(tx.voucher_code, tx.package_id).catch(() => {});
        }
    }

    // Filter valid successful transactions with voucher codes
    const successfulWithVoucher = rows.filter(r => r.voucher_code && (r.status === 'success' || r.status === 'SUCCESS'));

    if (isRecoverRoute) {
        // Return array directly for legacy/client recover-voucher endpoint
        const vouchersArray = (successfulWithVoucher.length > 0 ? successfulWithVoucher : rows)
            .filter(r => r.voucher_code)
            .map(r => ({
                voucher_code: r.voucher_code || '',
                package_name: r.package_name || 'Internet Package',
                amount: r.amount || 0,
                status: r.status,
                created_at: r.created_at
            }));
        return { statusCode: 200, data: vouchersArray };
    }

    const primaryTx = successfulWithVoucher.length > 0 ? successfulWithVoucher[0] : rows[0];

    if (primaryTx.voucher_code) {
        const vouchersList = (successfulWithVoucher.length > 0 ? successfulWithVoucher : rows)
            .filter(r => r.voucher_code)
            .map(r => ({
                voucher_code: r.voucher_code,
                package_name: r.package_name || 'Internet Package',
                amount: r.amount,
                status: r.status,
                created_at: r.created_at
            }));

        return {
            statusCode: 200,
            data: {
                success: true,
                voucher_code: primaryTx.voucher_code,
                package_name: primaryTx.package_name || 'Internet Package',
                status: primaryTx.status,
                vouchers: vouchersList
            }
        };
    }

    if (primaryTx.status === 'pending') {
        return {
            statusCode: 400,
            data: {
                success: false,
                message: "Transaction status is 'pending'. If you paid on Mobile Money, please wait a moment and try again."
            }
        };
    }

    return {
        statusCode: 400,
        data: {
            success: false,
            message: `Transaction status is '${primaryTx.status}'. If you paid, please verify your transaction reference or contact support.`
        }
    };
}

// Find Lost Voucher Code by Transaction ID, Gateway Reference or Phone Number
router.post('/find-voucher', async (req, res) => {
    try {
        const result = await handleVoucherRecovery(req, false);
        return res.status(result.statusCode).json(result.data);
    } catch (err) {
        console.error('Find Voucher Error:', err);
        return res.status(500).json({ success: false, error: 'Server error retrieving voucher' });
    }
});

router.get('/find-voucher', async (req, res) => {
    try {
        const result = await handleVoucherRecovery(req, false);
        return res.status(result.statusCode).json(result.data);
    } catch (err) {
        console.error('Find Voucher Error:', err);
        return res.status(500).json({ success: false, error: 'Server error retrieving voucher' });
    }
});

// Recover Voucher Endpoint (Legacy / Client HTML fallback)
router.post('/recover-voucher', async (req, res) => {
    try {
        const result = await handleVoucherRecovery(req, true);
        return res.status(result.statusCode).json(result.data);
    } catch (err) {
        console.error('Recover Voucher Error:', err);
        return res.status(500).json({ error: 'Server error recovering voucher' });
    }
});

router.get('/recover-voucher', async (req, res) => {
    try {
        const result = await handleVoucherRecovery(req, true);
        return res.status(result.statusCode).json(result.data);
    } catch (err) {
        console.error('Recover Voucher Error:', err);
        return res.status(500).json({ error: 'Server error recovering voucher' });
    }
});

module.exports = router;



