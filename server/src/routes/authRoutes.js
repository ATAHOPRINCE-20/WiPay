const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// Login API (Admin)
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // 1. Try Admin Table
        let [users] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
        let role = null;
        let userData = null;

        if (users.length > 0) {
            userData = users[0];
            role = userData.role;
        } else {
            // 2. Try Agent Table
            let [agents] = await db.query('SELECT * FROM agents WHERE username = ?', [username]);
            if (agents.length > 0) {
                userData = agents[0];
                role = 'agent';
            }
        }

        if (!userData) return res.status(400).json({ error: 'User not found' });

        let validPass = false;
        try {
            validPass = await bcrypt.compare(password, userData.password_hash);
        } catch (e) {
            console.error("Bcrypt compare error:", e);
        }

        // --- LEGACY MIGRATION ---
        if (!validPass && password === userData.password_hash) {
            console.log(`[AUTH] Migrating plain-text password for user: ${username}`);
            const salt = await bcrypt.genSalt(10);
            const newHash = await bcrypt.hash(password, salt);
            const table = (users.length > 0) ? 'admins' : 'agents';
            await db.query(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [newHash, userData.id]);
            validPass = true;
        }

        if (!validPass) return res.status(400).json({ error: 'Invalid password' });

        // Create Token
        const payload = { 
            id: userData.id, 
            username: userData.username, 
            role: role 
        };
        
        // Add admin_id for agents
        if (role === 'agent') {
            payload.admin_id = userData.admin_id;
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        // Set HttpOnly/Secure Cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: false, // Temporary fix for redirect loop
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 
        });

        res.json({ token, username: userData.username, role: role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout API
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

// Change Password API
router.post('/admin/change-password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and New passwords are required' });
    }

    try {
        const [admins] = await db.query('SELECT * FROM admins WHERE id = ?', [req.user.id]);
        if (admins.length === 0) return res.status(404).json({ error: 'User not found' });

        const admin = admins[0];
        const validPass = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!validPass) return res.status(400).json({ error: 'Incorrect current password' });

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        await db.query('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error('Change Pass Error:', err);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;
