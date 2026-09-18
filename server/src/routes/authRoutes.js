const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const sessionStore = require('../config/session');
const { sendRegistrationOTP, sendWelcomeEmail } = require('../utils/email');

// Login API (Admin & Agent)
async function loginHandler(req, res) {
    const rawUsername = req.body.username || '';
    const password = req.body.password || '';
    const username = rawUsername.trim();

    try {
        const [users] = await db.query('SELECT * FROM admins WHERE LOWER(username) = LOWER(?)', [username]);
        let user = users[0];
        let role = user ? user.role : null;
        let isAgent = false;

        if (users.length === 0) {
            // Check agents table
            const [agents] = await db.query('SELECT * FROM agents WHERE LOWER(username) = LOWER(?)', [username]);
            if (agents.length === 0) {
                return res.status(400).json({ error: 'User not found' });
            }
            user = agents[0];
            role = 'agent';
            isAgent = true;
        }

        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) return res.status(400).json({ error: 'Invalid password' });

        const tokenPayload = isAgent 
            ? { id: user.id, username: user.username, role: 'agent', admin_id: user.admin_id }
            : { id: user.id, username: user.username, role: user.role };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            token,
            role,
            username: user.username,
            admin: isAgent ? {
                id: user.id,
                username: user.username,
                role: 'agent',
                admin_id: user.admin_id
            } : {
                id: user.id,
                username: user.username,
                role: user.role,
                portal_slug: user.portal_slug,
                portal_dns: user.portal_dns,
                business_name: user.business_name,
                billing_type: user.billing_type,
                subscription_expiry: user.subscription_expiry
            }
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

router.post('/login', loginHandler);
router.post('/auth/login', loginHandler);

// Send Verification OTP API
router.post('/auth/register/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const [exists] = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
        if (exists.length > 0) return res.status(400).json({ error: 'Email is already registered' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        sessionStore.set(`register_otp_${email}`, { otp, expiry: Date.now() + 10 * 60 * 1000 });

        console.log(`\n🔑 [DEV] Registration OTP for ${email}: ${otp}\n`);

        await sendRegistrationOTP(email, otp);
        res.json({ message: 'Verification OTP sent to email' });
    } catch (err) {
        console.error('Send OTP Error:', err);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

// Verify OTP API
router.post('/auth/register/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    const record = sessionStore.get(`register_otp_${email}`);
    if (!record || record.otp !== otp || record.expiry < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ message: 'Email verified successfully' });
});

// Registration API (Public)
router.post('/auth/register', async (req, res) => {
    const { username, password, email, company_name, subdomain, phone_number, referral_code, otp } = req.body;
    if (!username || !password || !email || !company_name || !subdomain || !phone_number || !otp) {
        return res.status(400).json({ error: 'Required fields missing' });
    }

    // 1. Verify OTP
    const record = sessionStore.get(`register_otp_${email}`);
    if (!record || record.otp !== otp || record.expiry < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired OTP. Please verify your email again.' });
    }

    try {
        const dnsName = `${subdomain.trim().toLowerCase()}.ugpay.tech`;
        const [exists] = await db.query(
            'SELECT id FROM admins WHERE username = ? OR email = ? OR portal_dns = ?',
            [username, email, dnsName]
        );
        if (exists.length > 0) {
            return res.status(400).json({ error: 'Username, Email, or Subdomain is already taken' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const portalSlug = 'wp_' + crypto.randomBytes(6).toString('hex');

        const [result] = await db.query(
            'INSERT INTO admins (username, password_hash, email, role, business_name, business_phone, portal_dns, portal_slug, referral_code, subscription_expiry, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())',
            [username, hash, email, 'admin', company_name, phone_number, dnsName, portalSlug, referral_code || null]
        );
        const userId = result.insertId;

        sessionStore.delete(`register_otp_${email}`);

        // Send Welcome Email (30 days access & MikroTik config contact info)
        sendWelcomeEmail(email, username, company_name).catch(err => console.error('Welcome Email Error:', err));

        const token = jwt.sign({ id: userId, username, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('token', token, { httpOnly: true, secure: false, sameSite: 'strict', maxAge: 24 * 60 * 60 * 1000 });

        res.status(201).json({
            token,
            admin: {
                id: userId,
                username,
                role: 'admin',
                portal_slug: portalSlug,
                portal_dns: dnsName,
                business_name: company_name
            }
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Profile (requires auth)
router.get('/auth/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'agent') {
            const [agentRows] = await db.query('SELECT id, username, email, phone_number as business_phone, admin_id, created_at FROM agents WHERE id = ?', [req.user.id]);
            if (agentRows.length === 0) return res.status(404).json({ error: 'Agent not found' });
            return res.json({
                ...agentRows[0],
                role: 'agent'
            });
        }

        const [rows] = await db.query('SELECT id, username, email, role, portal_slug, portal_dns, business_name, business_phone, portal_logo, portal_welcome_msg, terms_text, billing_type, subscription_expiry FROM admins WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Profile Error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update Profile
router.put('/auth/profile', authenticateToken, async (req, res) => {
    const { business_name, business_phone, email } = req.body;
    try {
        await db.query(
            'UPDATE admins SET business_name = ?, business_phone = ?, email = ? WHERE id = ?',
            [business_name, business_phone, email, req.user.id]
        );
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Update Profile Error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Failed to update profile' });
    }
});

// Logout API
const logoutHandler = (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
};
router.post('/logout', logoutHandler);
router.post('/auth/logout', logoutHandler);

// Change Password API
router.post('/auth/change-password', authenticateToken, async (req, res) => {
    const { current_password, new_password, new_password_confirmation } = req.body;
    if (!current_password || !new_password || !new_password_confirmation) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    if (new_password !== new_password_confirmation) {
        return res.status(400).json({ message: 'New passwords do not match' });
    }

    try {
        const [admins] = await db.query('SELECT * FROM admins WHERE id = ?', [req.user.id]);
        if (admins.length === 0) return res.status(404).json({ error: 'User not found' });

        const admin = admins[0];
        const validPass = await bcrypt.compare(current_password, admin.password_hash);
        if (!validPass) return res.status(400).json({ message: 'Incorrect current password' });

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);

        await db.query('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Change Pass Error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
