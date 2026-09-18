const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, verifySuperAdmin, JWT_SECRET } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

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
            'INSERT INTO admins (username, password_hash, role, billing_type, commission_rate, email, business_name, business_phone, portal_slug, subscription_expiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))',
            [username, hash, 'admin', bType, cRate, userEmail, bName, bPhone, portalSlug]
        );

        if (userEmail) {
            sendWelcomeEmail(userEmail, username, bName).catch(err => console.error('Tenant Welcome Email Error:', err));
        }

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
        await db.query(
            'UPDATE admins SET subscription_expiry = ?, trial_reminder_5d_sent_at = NULL, trial_reminder_1d_sent_at = NULL, trial_reminder_0d_sent_at = NULL WHERE id = ?',
            [expiry_date, tenantId]
        );

        // Send tenant confirmation email if email exists
        const [rows] = await db.query('SELECT username, email, business_name FROM admins WHERE id = ?', [tenantId]);
        if (rows.length > 0 && rows[0].email) {
            const { sendSubscriptionRenewalEmail } = require('../utils/email');
            sendSubscriptionRenewalEmail({
                toEmail: rows[0].email,
                username: rows[0].username,
                businessName: rows[0].business_name,
                amount: 0,
                months: 1,
                ref: 'SUPER-ADMIN-UPDATE',
                newExpiry: expiry_date
            }).catch(e => console.error('[EMAIL] Manual Extension Email Error:', e.message));
        }

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
        
        // 1. Commission Fees collected from voucher sales (with fallback for past transactions)
        const [[{ totalRevenue, totalCommissionFees }]] = await db.query(`
            SELECT 
                COALESCE(SUM(t.amount), 0) as totalRevenue, 
                COALESCE(SUM(
                    CASE 
                        WHEN t.fee IS NOT NULL AND t.fee > 0 THEN t.fee
                        WHEN COALESCE(a.billing_type, 'commission') = 'commission' THEN (t.amount * COALESCE(a.commission_rate, 5.00) / 100)
                        ELSE 0
                    END
                ), 0) as totalCommissionFees 
            FROM transactions t
            LEFT JOIN admins a ON t.admin_id = a.id
            WHERE (t.status = "success" OR t.status = "SUCCESS")
              AND (t.transaction_ref NOT LIKE 'SMS-%' AND t.transaction_ref NOT LIKE 'SUB-%' AND t.transaction_ref NOT LIKE 'W-%')
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
        const [[{ superWithdrawn }]] = await db.query('SELECT COALESCE(SUM(amount), 0) as superWithdrawn FROM withdrawals WHERE admin_id = ? AND status != "failed"', [req.user.id]);
        const [[adminRow]] = await db.query('SELECT COALESCE(opening_balance, 0.00) as opening_balance FROM admins WHERE id = ?', [req.user.id]);
        const superOpeningBalance = Number(adminRow?.opening_balance || 0);

        // Total Platform Earnings = Opening Balance + Commission Fees + Subscription Payments + SMS Topups
        const totalEarnings = superOpeningBalance + Number(totalCommissionFees || 0) + Number(totalSubscriptionFees || 0) + Number(totalSmsFees || 0);
        const withdrawableBalance = Math.max(0, totalEarnings - Number(superWithdrawn || 0));

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
            totalWithdrawn: totalWithdrawn || 0,
            superWithdrawn: superWithdrawn || 0,
            withdrawableBalance: withdrawableBalance
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

// Impersonate Tenant
router.post('/tenants/:id/impersonate', async (req, res) => {
    const tenantId = req.params.id;
    try {
        const [rows] = await db.query('SELECT id, username, role, portal_slug, portal_dns, business_name FROM admins WHERE id = ?', [tenantId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Tenant account not found' });

        const tenant = rows[0];
        const tokenPayload = {
            id: tenant.id,
            username: tenant.username,
            role: 'admin',
            impersonatedBy: req.user.id
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

        res.json({
            token,
            admin: {
                id: tenant.id,
                username: tenant.username,
                role: 'admin',
                portal_slug: tenant.portal_slug,
                portal_dns: tenant.portal_dns,
                business_name: tenant.business_name
            }
        });
    } catch (err) {
        console.error('Impersonation Error:', err);
        res.status(500).json({ error: 'Failed to impersonate tenant' });
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

// Database Health & Connection Pool Metrics Endpoint for Super Admin Dashboard
router.get('/db-health', async (req, res) => {
    try {
        const [[connectedRow]] = await db.query("SHOW STATUS LIKE 'Threads_connected'").catch(() => [[{ Value: 0 }]]);
        const [[runningRow]] = await db.query("SHOW STATUS LIKE 'Threads_running'").catch(() => [[{ Value: 0 }]]);
        const [[maxUsedRow]] = await db.query("SHOW STATUS LIKE 'Max_used_connections'").catch(() => [[{ Value: 0 }]]);
        const [[maxConnRow]] = await db.query("SHOW VARIABLES LIKE 'max_connections'").catch(() => [[{ Value: 300 }]]);
        const [processList] = await db.query("SHOW PROCESSLIST").catch(() => [[]]);

        const threadsConnected = Number(connectedRow?.Value || 0);
        const threadsRunning = Number(runningRow?.Value || 0);
        const maxUsedConnections = Number(maxUsedRow?.Value || 0);
        const maxConnections = Number(maxConnRow?.Value || 300);

        const sleepingCount = processList.filter(p => p.Command === 'Sleep').length;

        let status = 'healthy';
        if (threadsConnected >= maxConnections * 0.85) {
            status = 'critical';
        } else if (threadsConnected >= maxConnections * 0.65) {
            status = 'warning';
        }

        res.json({
            status,
            threads_connected: threadsConnected,
            threads_running: threadsRunning,
            sleeping_connections: sleepingCount,
            max_used_connections: maxUsedConnections,
            max_connections: maxConnections,
            pool_limit: 30,
            processes: processList.map(p => ({
                id: p.Id,
                user: p.User,
                host: p.Host,
                db: p.db,
                command: p.Command,
                time: p.Time,
                state: p.State,
                info: p.Info
            }))
        });
    } catch (err) {
        console.error('Fetch DB Health Error:', err);
        res.status(500).json({ error: 'Failed to fetch DB health metrics' });
    }
});

// One-click Purge Sleeping Connections
router.post('/db-health/purge-sleeping', async (req, res) => {
    try {
        const [processes] = await db.query("SHOW PROCESSLIST");
        const sleepingIds = processes.filter(p => p.Command === 'Sleep' && p.Time > 30).map(p => p.Id);

        let killed = 0;
        for (const id of sleepingIds) {
            try {
                await db.query(`KILL ${id}`);
                killed++;
            } catch (_) {}
        }

        res.json({ message: `Purged ${killed} sleeping database connection(s).`, killed });
    } catch (err) {
        console.error('Purge Sleeping Connections Error:', err);
        res.status(500).json({ error: 'Failed to purge sleeping connections' });
    }
});

module.exports = router;
