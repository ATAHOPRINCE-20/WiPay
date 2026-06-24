const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { runPendingMigrations } = require('./src/utils/dbMigration');

const app = express();
const server = http.createServer(app);

// Run Migrations
runPendingMigrations();

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*", // Use env var in production
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5002;

app.set('trust proxy', 1);

// Debug Logging Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Attach IO to request for routes to use
app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- Security Middleware ---

// 1. Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 10000, // Configurable limit
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many login attempts, please try again later.',
});

// 2. Security Headers & CORS
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*", // Use env var in production
    credentials: true
}));

// --- Middleware ---
app.use(cookieParser());
app.use(bodyParser.json());
// Serve frontend static files. Prefer `wipay-frontend/dist` if it exists (production build),
// otherwise fall back to legacy `client` folder used by older deployments.
const frontendDist = path.join(__dirname, '..', 'wipay-frontend', 'dist');
const legacyClient = path.join(__dirname, '..', 'client');
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    console.log('Serving static files from', frontendDist);
} else {
    app.use(express.static(legacyClient));
    console.log('Serving static files from', legacyClient);
}

// NOTE: SPA fallback and /login route are mounted after API routes to avoid
// intercepting API requests. They are added below after route mounting.

// --- Routes ---
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');

// Apply Limiters
app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

// Mount Routes
app.use('/api', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', paymentRoutes);
app.use('/api/super', superAdminRoutes);
app.use('/api', adminRoutes);

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Serve legacy hotspot/login page if present in frontend dist
app.get('/login', (req, res, next) => {
    const hotspotFile = path.join(frontendDist, 'hotspot-login.html');
    if (fs.existsSync(hotspotFile)) return res.sendFile(hotspotFile);
    return next();
});

// SPA fallback: serve index.html for any unmatched route (lets React Router handle client-side routes)
app.get('*', (req, res, next) => {
    try {
        const idx = fs.existsSync(path.join(frontendDist, 'index.html')) ? path.join(frontendDist, 'index.html') : path.join(legacyClient, 'index.html');
        if (fs.existsSync(idx)) return res.sendFile(idx);
        return next();
    } catch (e) {
        return next();
    }
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('--- SERVER RESTARTED: CHECK PAYMENT FIX ACTIVE ---');
});
