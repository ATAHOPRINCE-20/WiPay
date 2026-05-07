const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('../config/db'); // Require db connection

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET is not defined in .env');
    process.exit(1);
}

function authenticateToken(req, res, next) {
    const cookieToken = req.cookies.token;
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    
    const token = cookieToken || headerToken;

    // console.log(`[AUTH DEBUG] Request: ${req.method} ${req.originalUrl || req.url}`);

    if (!token) {
        // console.warn(`[AUTH DEBUG] No token found for ${req.url}. Returning 401.`);
        return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error(`[AUTH DEBUG] JWT Verify Error for ${req.url}:`, err.message);
            return res.sendStatus(403);
        }
        req.user = user;

        // Fire-and-forget update of last_active_at
        const table = (user.role === 'agent') ? 'agents' : 'admins';
        db.query(`UPDATE ${table} SET last_active_at = NOW() WHERE id = ?`, [user.id])
            .catch(err => console.error(`Error updating last_active for ${user.role}:`, err.message));

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

function verifyAdmin(req, res, next) {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        next();
    } else {
        res.status(403).json({ error: 'Access denied: Admin only' });
    }
}

module.exports = { authenticateToken, verifySuperAdmin, verifyAdmin, JWT_SECRET };
