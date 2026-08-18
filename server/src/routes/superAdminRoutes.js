const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticateToken, verifySuperAdmin } = require('../middleware/auth');

// Middleware for all super admin routes
router.use(authenticateToken);
router.use(verifySuperAdmin);

// Get All Tenants (Admins) with full Sales, Commission, Routers & Active Sessions Metrics
router.get('/tenants', async (req, res) => {
    try {
        const [admins] = await db.query(`
            SELECT 
                a.id, a.username, a.role, a.billing_type, 
                COALESCE(a.commission_rate, 5.00) as commission_rate,
                COALESCE(a.opening_balance, 0.00) as opening_balance,
                a.last_settled_at,
                a.subscription_expiry, a.last_active_at, a.created_at, a.portal_slug, a.email, a.business_name, a.business_phone,
                COALESCE(t.total_sales, 0) as total_sales,
                (
                  CASE 
                    WHEN a.billing_type = 'subscription' THEN COALESCE(s.total_sub_paid, 0)
                    ELSE COALESCE(t.total_commission, 0)
                  END
                ) as total_commission,
                COALESCE(w.total_withdrawn, 0) as total_withdrawn,
                GREATEST(0, COALESCE(a.opening_balance, 0.00) + (
                    SELECT COALESCE(SUM(tr.amount - COALESCE(tr.fee, 0)), 0)
                    FROM transactions tr
                    WHERE tr.admin_id = a.id
                      AND (tr.status = 'success' OR tr.status = 'SUCCESS')
                      AND (tr.payment_method IS NULL OR tr.payment_method != 'cash_agent')
                      AND (tr.transaction_ref NOT LIKE 'SMS-%' AND tr.transaction_ref NOT LIKE 'SUB-%' AND tr.transaction_ref NOT LIKE 'W-%')
                      AND tr.created_at >= COALESCE(a.last_settled_at, '1970-01-01')
                ) - (
                    SELECT COALESCE(SUM(wd.amount), 0)
                    FROM withdrawals wd
                    WHERE wd.admin_id = a.id
                      AND wd.status != 'failed'
                      AND wd.created_at >= COALESCE(a.last_settled_at, '1970-01-01')
                )) as total_balance,
                COALESCE(r.router_count, 0) as router_count,
                COALESCE(act.active_users_count, 0) as active_users_count
            FROM admins a
            LEFT JOIN (
                SELECT admin_id, 
                       SUM(amount) as total_sales,
                       SUM(COALESCE(fee, 0)) as total_commission
                FROM transactions
                WHERE (status = 'success' OR status = 'SUCCESS')
                  AND (payment_method IS NULL OR payment_method != 'cash_agent')
                  AND (transaction_ref NOT LIKE 'SMS-%' AND transaction_ref NOT LIKE 'SUB-%' AND transaction_ref NOT LIKE 'W-%')
                GROUP BY admin_id
            ) t ON a.id = t.admin_id
            LEFT JOIN (
                SELECT admin_id,
                       SUM(amount) as total_sub_paid
                FROM admin_subscriptions
                WHERE (status = 'success' OR status = 'SUCCESS')
                GROUP BY admin_id
            ) s ON a.id = s.admin_id
            LEFT JOIN (
                SELECT admin_id, 
                       SUM(amount) as total_withdrawn
                FROM withdrawals
                WHERE status != 'failed'
                GROUP BY admin_id
            ) w ON a.id = w.admin_id
            LEFT JOIN (
                SELECT admin_id, COUNT(*) as router_count
                FROM routers
                GROUP BY admin_id
            ) r ON a.id = r.admin_id
            LEFT JOIN (
                SELECT r2.admin_id, COUNT(DISTINCT acc.username) as active_users_count
                FROM radacct acc
                JOIN routers r2 ON acc.nasipaddress = r2.ip_address
                WHERE acc.acctstoptime IS NULL
                GROUP BY r2.admin_id
            ) act ON a.id = act.admin_id
            ORDER BY a.created_at DESC
        `);
        res.json(admins);
    } catch (err) {
        console.error('Fetch Tenants Error:', err);
        res.status(500).json({ error: 'Server error fetching tenants' });
    }
});

// Adjust / Set Tenant Starting Balance & Reset Settlement Cut-off Date
const handleAdjustBalanceRoute = async (req, res) => {
    const tenantId = req.params.id;
    const { new_balance } = req.body;

    const balance = parseFloat(new_balance);
    if (isNaN(balance) || balance < 0) {
        return res.status(400).json({ error: 'Valid balance amount is required' });
    }

    try {
        await db.query(
            'UPDATE admins SET opening_balance = ?, last_settled_at = NOW() WHERE id = ?',
            [balance, tenantId]
        );
        res.json({ message: `Tenant balance successfully set to UGX ${balance.toLocaleString()}` });
    } catch (err) {
        console.error('Adjust Balance Error:', err);
        res.status(500).json({ error: 'Failed to adjust tenant balance' });
    }
};

router.post('/tenants/:id/adjust-balance', handleAdjustBalanceRoute);
router.patch('/tenants/:id/adjust-balance', handleAdjustBalanceRoute);
router.put('/tenants/:id/adjust-balance', handleAdjustBalanceRoute);

// Create New Tenant
router.post('/tenants', async (req, res) => {
    const { username, password, email, business_name, business_phone, billing_type, commission_rate } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        // Check if username exists
        const [existing] = await db.query('SELECT id FROM admins WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const bType = billing_type || 'commission';
        const cRate = parseFloat(commission_rate) >= 0 ? parseFloat(commission_rate) : 5.00;
        const userEmail = email || null;
        const bName = business_name || 'UGPAY';
        const bPhone = business_phone || null;
        const portalSlug = 'wp_' + crypto.randomBytes(6).toString('hex');

        await db.query(
            'INSERT INTO admins (username, password_hash, role, billing_type, commission_rate, email, business_name, business_phone, portal_slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [username, hash, 'admin', bType, cRate, userEmail, bName, bPhone, portalSlug]
        );

        res.status(201).json({ message: 'Tenant created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create tenant' });
    }
});

// Delete Tenant
router.delete('/tenants/:id', async (req, res) => {
    const tenantId = req.params.id;

    // Prevent deleting self
    if (parseInt(tenantId) === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    try {
        await db.query('DELETE FROM admins WHERE id = ?', [tenantId]);
        res.json({ message: 'Tenant deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete tenant' });
    }
});

// Update Subscription Expiry
router.patch('/tenants/:id/subscription', async (req, res) => {
    const tenantId = req.params.id;
    const { expiry_date } = req.body;

    if (!expiry_date) return res.status(400).json({ error: 'Date required' });

    try {
        await db.query('UPDATE admins SET subscription_expiry = ? WHERE id = ?', [expiry_date, tenantId]);
        res.json({ message: 'Subscription updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

// Update Commission Rate
router.patch('/tenants/:id/commission', async (req, res) => {
    const tenantId = req.params.id;
    const { commission_rate } = req.body;

    const rate = parseFloat(commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Valid commission rate percentage is required (0-100)' });
    }

    try {
        await db.query('UPDATE admins SET commission_rate = ? WHERE id = ?', [rate, tenantId]);
        res.json({ message: `Commission rate updated to ${rate}%` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update commission rate' });
    }
});

// Reset Tenant Password
router.patch('/tenants/:id/password', async (req, res) => {
    const tenantId = req.params.id;
    const { new_password } = req.body;

    if (!new_password) return res.status(400).json({ error: 'New password is required' });

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(new_password, salt);

        await db.query('UPDATE admins SET password_hash = ? WHERE id = ?', [hash, tenantId]);
        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// System Stats
router.get('/stats', async (req, res) => {
    try {
        const [[{ tenantCount }]] = await db.query('SELECT COUNT(*) as tenantCount FROM admins WHERE role = "admin"');
        const [[{ routerCount }]] = await db.query('SELECT COUNT(*) as routerCount FROM routers');
        const [[{ activeUsersCount }]] = await db.query('SELECT COUNT(DISTINCT username) as activeUsersCount FROM radacct WHERE acctstoptime IS NULL');
        const [[{ totalVouchers }]] = await db.query('SELECT COUNT(*) as totalVouchers FROM vouchers');
        
        // 1. Commission Fees collected from voucher sales
        const [[{ totalRevenue, totalCommissionFees }]] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as totalRevenue, 
                   COALESCE(SUM(fee), 0) as totalCommissionFees 
            FROM transactions 
            WHERE (status = "success" OR status = "SUCCESS")
              AND (transaction_ref NOT LIKE 'SMS-%' AND transaction_ref NOT LIKE 'SUB-%' AND transaction_ref NOT LIKE 'W-%')
        `);

        // 2. Subscription Fees collected from tenants
        const [[{ totalSubscriptionFees }]] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as totalSubscriptionFees 
            FROM admin_subscriptions 
            WHERE (status = "success" OR status = "SUCCESS")
        `).catch(() => [[{ totalSubscriptionFees: 0 }]]);

        // 3. SMS Fees collected from tenants
        const [[{ totalSmsFees }]] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as totalSmsFees 
            FROM sms_fees 
            WHERE (status = "success" OR status = "SUCCESS")
              AND type = "recharge"
        `).catch(() => [[{ totalSmsFees: 0 }]]);

        const [[{ totalWithdrawn }]] = await db.query('SELECT COALESCE(SUM(amount), 0) as totalWithdrawn FROM withdrawals WHERE status != "failed"');

        // Total Platform Earnings = Commission Fees + Subscription Payments + SMS Topups
        const totalEarnings = Number(totalCommissionFees || 0) + Number(totalSubscriptionFees || 0) + Number(totalSmsFees || 0);

        res.json({
            tenantCount: tenantCount || 0,
            routerCount: routerCount || 0,
            activeUsersCount: activeUsersCount || 0,
            totalVouchers: totalVouchers || 0,
            totalRevenue: totalRevenue || 0,
            totalCommission: totalEarnings || 0,
            commissionFees: totalCommissionFees || 0,
            subscriptionFees: totalSubscriptionFees || 0,
            smsFees: totalSmsFees || 0,
            totalWithdrawn: totalWithdrawn || 0
        });
    } catch (err) {
        console.error('Fetch Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch super admin stats' });
    }
});

// Update Tenant Details (Generic Edit)
router.put('/tenants/:id', async (req, res) => {
    const tenantId = req.params.id;
    const { username, email, business_name, business_phone, billing_type, commission_rate, subscription_expiry } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        let expiry = null;
        if (billing_type === 'subscription' && subscription_expiry) {
            expiry = new Date(subscription_expiry).toISOString().slice(0, 19).replace('T', ' ');
        }
        const cRate = (commission_rate !== undefined && commission_rate !== null && !isNaN(parseFloat(commission_rate))) ? parseFloat(commission_rate) : 5.00;

        await db.query(
            'UPDATE admins SET username = ?, email = ?, business_name = ?, business_phone = ?, billing_type = ?, commission_rate = ?, subscription_expiry = ? WHERE id = ?',
            [username, email || null, business_name || 'UGPAY', business_phone || null, billing_type || 'commission', cRate, expiry, tenantId]
        );
        res.json({ message: 'Tenant updated successfully' });
    } catch (err) {
        console.error('Update Tenant Error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});

router.get('/registration-requests', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM registration_requests ORDER BY created_at DESC');
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

router.get('/pending-ads', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM portal_ads WHERE status = "pending" ORDER BY created_at DESC');
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

router.get('/ads/pending', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT a.*, adm.username as admin_username 
            FROM portal_ads a 
            JOIN admins adm ON a.admin_id = adm.id 
            WHERE a.status = "pending" 
            ORDER BY a.created_at DESC
        `);
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

router.get('/resources', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM admin_resources ORDER BY created_at DESC');
        res.json(rows);
    } catch (e) {
        res.json([]);
    }
});

module.exports = router;
