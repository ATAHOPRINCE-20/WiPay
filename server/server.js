const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();
require('./src/utils/patchRouterOS');

const http = require('http');
const { Server } = require('socket.io');
const { runPendingMigrations } = require('./src/utils/dbMigration');

const app = express();
app.use(compression());
const server = http.createServer(app);

// Process Safety Exception Handlers (Prevents background socket crashes from killing process)
process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]:', reason?.message || reason);
});

// Real-time Socket.IO Server

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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Allow up to 100 requests per 15 mins for shared proxy IPs
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
// Serve frontend static files. Prefer `wipay-frontend/dist` if it exists (production build),
// otherwise fall back to legacy `client` folder used by older deployments.
const frontendDist = path.join(__dirname, '..', 'wipay-frontend', 'dist');
const legacyClient = path.join(__dirname, '..', 'client');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
console.log('Serving uploaded files from', uploadsDir);

const staticOptions = {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
};

if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, staticOptions));
    console.log('Serving static files from', frontendDist);
} else {
    app.use(express.static(legacyClient, staticOptions));
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
const registrationRoutes = require('./src/routes/registrationRoutes');
const agentRoutes = require('./src/routes/agentRoutes');

// Apply Limiters
app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

// Mount Routes
app.use('/api', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', paymentRoutes);
app.use('/api', registrationRoutes);
app.use('/api', agentRoutes);
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
        if (fs.existsSync(idx)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            return res.sendFile(idx);
        }
        return next();
    } catch (e) {
        return next();
    }
});

// Start Server Function
async function startServer() {
    try {
        console.log('[STARTUP] Running database migrations...');
        await runPendingMigrations();
        console.log('[STARTUP] Database migrations completed successfully.');
    } catch (err) {
        console.error('[MIGRATION FATAL ERROR]:', err);
    }

    // Start Periodic Stale RADIUS Session Sweeper
    const { cleanupStaleRadiusSessions } = require('./src/utils/radius');
    setInterval(() => {
        cleanupStaleRadiusSessions().catch(err => console.error('[Sweeper Error]:', err));
    }, 2 * 60 * 1000);

    // Start Periodic Trial Expiration Email Reminder Scheduler
    const { startTrialReminderScheduler } = require('./src/services/trialReminderCron');
    startTrialReminderScheduler();

    // Start Periodic Router Offline Email Alert Monitor Scheduler
    const { startRouterMonitorScheduler } = require('./src/services/routerMonitorCron');
    startRouterMonitorScheduler();

    // Start Server Listener
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('--- SERVER RESTARTED: SESSION SWEEPER, TRIAL REMINDERS & ROUTER MONITOR ACTIVE ---');
    });
}

startServer();


