const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sessionStore = require('../config/session');


// Helper to resolve admin_id from slug, hostname, or query parameters
async function resolveAdmin(req) {
    const { admin_id, slug } = req.query;

    // 1. Resolve by slug
    if (slug) {
        const [rows] = await db.query('SELECT id FROM admins WHERE portal_slug = ?', [slug]);
        if (rows.length > 0) return rows[0].id;
    }

    // 2. Resolve by Host Header / portal_dns
    const host = req.headers.host;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.includes('localhost:')) {
        const domain = host.split(':')[0].toLowerCase();
        const [rows] = await db.query('SELECT id FROM admins WHERE LOWER(portal_dns) = ?', [domain]);
        if (rows.length > 0) return rows[0].id;
    }

    // 3. Fallback to query admin_id
    if (admin_id) {
        const parsed = parseInt(admin_id, 10);
        if (!isNaN(parsed)) return parsed;
    }

    return null;
}

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
            JOIN vouchers v ON p.id = v.package_id AND v.is_used = 0
            JOIN admins a ON p.admin_id = a.id
            WHERE p.admin_id = ?
            AND p.is_active = 1
            AND (a.billing_type != 'subscription' OR a.subscription_expiry > NOW() OR a.subscription_expiry IS NULL)
            GROUP BY p.id, p.name, p.price, p.validity_hours
            HAVING COUNT(v.id) > 0
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

module.exports = router;
