const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { addHotspotUser } = require('../utils/routerController');

// --- Agent Authentication ---

// Agent Login
router.post('/agent/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [agents] = await db.query('SELECT * FROM agents WHERE username = ?', [username]);
        if (agents.length === 0) return res.status(400).json({ error: 'Agent not found' });

        const agent = agents[0];
        
        let validPass = false;
        try {
            validPass = await bcrypt.compare(password, agent.password_hash);
        } catch (e) {
            console.error("Bcrypt compare error (Agent):", e);
        }

        // --- LEGACY MIGRATION ---
        if (!validPass && password === agent.password_hash) {
            console.log(`[AUTH] Migrating plain-text password for Agent: ${username}`);
            const salt = await bcrypt.genSalt(10);
            const newHash = await bcrypt.hash(password, salt);
            await db.query('UPDATE agents SET password_hash = ? WHERE id = ?', [newHash, agent.id]);
            validPass = true;
        }

        if (!validPass) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign(
            { id: agent.id, username: agent.username, role: 'agent', admin_id: agent.admin_id },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https', 
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({ token, username: agent.username, role: 'agent' });
    } catch (err) {
        console.error('Agent Login Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware for agent-only routes
const authenticateAgent = (req, res, next) => {
    authenticateToken(req, res, async () => {
        // Ensure the user is actually an agent
        if (req.user && req.user.role === 'agent') {
            try {
                // AGENT ACCESS VALIDATION
                // We check if the Administrator who manages this agent has an active subscription.
                // Commission-based admins are exempt from this check.
                
                const [adminRows] = await db.query(
                    'SELECT billing_type, subscription_expiry FROM admins WHERE id = ?', 
                    [req.user.admin_id]
                );

                if (adminRows.length > 0) {
                    const { billing_type, subscription_expiry } = adminRows[0];
                    
                    const isSubscriptionBased = billing_type === 'subscription';
                    const isExpired = new Date(subscription_expiry) < new Date();

                    if (isSubscriptionBased && isExpired) {
                        return res.status(403).json({ 
                            error: 'System Access Denied: Admin subscription has expired. Please contact your administrator to renew.' 
                        });
                    }
                }

                // If not expired or not subscription-based, proceed
                next();

            } catch (err) {
                console.error('[AgentGuard] Validation Error:', err);
                res.status(500).json({ error: 'Internal security check failed' });
            }
        } else {
            res.status(403).json({ error: 'Access denied: Agents only' });
        }
    });
};

// --- Agent Operations ---

// Get Agent Stats & Inventory
router.get('/agent/stats', authenticateAgent, async (req, res) => {
    try {
        const agentId = req.user.id;
        
        // 1. Current Stock (assigned vouchers)
        const [stockRows] = await db.query(
            'SELECT COUNT(*) as count FROM vouchers WHERE agent_id = ? AND is_used = 0',
            [agentId]
        );

        // 2. Today's Sales
        const [salesRows] = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE agent_id = ? AND status = "success" AND DATE(created_at) = CURDATE()',
            [agentId]
        );

        res.json({
            stock: stockRows[0].count,
            todaySales: salesRows[0].total
        });
    } catch (err) {
        console.error('Agent Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Agent Analytics (Weekly, Monthly, Yearly)
router.get('/agent/analytics', authenticateAgent, async (req, res) => {
    try {
        const agentId = req.user.id;
        
        const [rows] = await db.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN created_at >= CURDATE() - INTERVAL 7 DAY THEN amount ELSE 0 END), 0) as weekly,
                COALESCE(SUM(CASE WHEN created_at >= CURDATE() - INTERVAL 30 DAY THEN amount ELSE 0 END), 0) as monthly,
                COALESCE(SUM(CASE WHEN created_at >= CURDATE() - INTERVAL 1 YEAR THEN amount ELSE 0 END), 0) as yearly
            FROM transactions 
            WHERE agent_id = ? AND status = 'success'
        `, [agentId]);

        res.json(rows[0]);
    } catch (err) {
        console.error('Agent Analytics Error:', err);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Sell Voucher
router.post('/agent/sell-voucher', authenticateAgent, async (req, res) => {
    const { package_id, phone_number } = req.body; // mobile number is optional for agent physical sale
    const agentId = req.user.id;
    const adminId = req.user.admin_id;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get a random voucher from THIS agent's stock
        // If package_id is provided, limit to that package. Otherwise, pick any.
        let query = 'SELECT v.*, p.name as package_name, p.price, p.validity_hours, p.router_id FROM vouchers v JOIN packages p ON v.package_id = p.id WHERE v.agent_id = ? AND v.is_used = 0';
        const params = [agentId];
        
        if (package_id) {
            query += ' AND v.package_id = ?';
            params.push(package_id);
        }
        
        query += ' ORDER BY RAND() LIMIT 1 FOR UPDATE';

        const [vouchers] = await connection.query(query, params);

        if (vouchers.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'No vouchers available in your stock' });
        }

        const voucher = vouchers[0];

        // 2. Mark Voucher as used
        await connection.query(
            'UPDATE vouchers SET is_used = 1, used_by = ?, used_at = NOW() WHERE id = ?',
            [phone_number || 'Cash Customer', voucher.id]
        );

        // 3. Record Transaction
        const reference = `AGT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        await connection.query(
            `INSERT INTO transactions (
                transaction_ref, admin_id, agent_id, amount, status, 
                payment_method, phone_number, package_id, package_name, voucher_code
            ) VALUES (?, ?, ?, ?, 'success', 'cash_agent', ?, ?, ?, ?)`,
            [
                reference, adminId, agentId, voucher.price, 
                phone_number || 'Cash Customer', voucher.package_id, voucher.package_name, voucher.code
            ]
        );

        // --- SYNC TO MIKROTIK (AGENT SALES) ---
        try {
            await addHotspotUser({
                name: voucher.code,
                password: voucher.code,
                router_id: voucher.router_id,
                validity_hours: voucher.validity_hours
            });
        } catch (routerErr) {
            console.error(`[AgentSell] MikroTik Sync Error:`, routerErr.message);
        }

        await connection.commit();

        // 4. Send Email Notification to Admin (Non-blocking)
        try {
            const [[admin]] = await db.query('SELECT email FROM admins WHERE id = ?', [adminId]);
            if (admin && admin.email) {
                const { sendAgentSaleNotification } = require('../utils/email');
                sendAgentSaleNotification(
                    admin.email, 
                    req.user.username, 
                    voucher.price, 
                    voucher.package_name, 
                    voucher.code, 
                    reference
                ).catch(e => console.error('Email Fail:', e));
            }
        } catch (e) {
            console.error('Admin Email Fetch Error:', e);
        }

        req.io.emit('data_update', { type: 'vouchers' });
        req.io.emit('data_update', { type: 'payments' });

        res.json({
            message: 'Voucher sold successfully',
            voucher: {
                code: voucher.code,
                name: voucher.package_name,
                price: voucher.price
            }
        });

    } catch (err) {
        await connection.rollback();
        console.error('Agent Sell Voucher Error:', err);
        res.status(500).json({ error: 'Transaction failed' });
    } finally {
        connection.release();
    }
});

// Recent Sales
router.get('/agent/sales', authenticateAgent, async (req, res) => {
    try {
        const agentId = req.user.id;
        const [rows] = await db.query(
            `SELECT t.*, p.name as package_name 
             FROM transactions t 
             LEFT JOIN packages p ON t.package_id = p.id 
             WHERE t.agent_id = ? 
             ORDER BY t.created_at DESC LIMIT 50`,
            [agentId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Agent Sales History Error:', err);
        res.status(500).json({ error: 'Failed to fetch sales history' });
    }
});

// Get My Packages (where I have stock)
router.get('/agent/packages', authenticateAgent, async (req, res) => {
    try {
        const agentId = req.user.id;
        const [rows] = await db.query(
            `SELECT p.id, p.name, p.price, COUNT(v.id) as stock
             FROM packages p
             JOIN vouchers v ON v.package_id = p.id
             WHERE v.agent_id = ? AND v.is_used = 0
             GROUP BY p.id`,
            [agentId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Agent Packages Error:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

module.exports = router;
