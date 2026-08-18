const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('../config/db'); // Require db connection

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not defined in .env');
    process.exit(1);
}

function authenticateToken(req, res, next) {
    const token = req.cookies.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

    if (!token) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;

        // Fire-and-forget update of last_activity
        // We don't await this to avoid slowing down valid requests
        db.query('UPDATE admins SET last_active_at = NOW() WHERE id = ?', [user.id])
            .catch(err => console.error('Error updating last_active:', err));

        next();
    });
}

function verifySuperAdmin(req, res, next) {
    if (req.user && req.user.role === 'super_admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied: Super Admin only' });
    }
}

module.exports = { authenticateToken, verifySuperAdmin, JWT_SECRET };
