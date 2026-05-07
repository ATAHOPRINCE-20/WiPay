const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { runPendingMigrations } = require('./src/utils/dbMigration');



const app = express();
app.disable('x-powered-by');
const server = http.createServer(app);
app.set('trust proxy', 1); 


// Run Migrations (Async)
runPendingMigrations().catch(err => console.error('Migration Error:', err));

const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

const PORT = parseInt(process.env.PORT) || 5010;

app.set('trust proxy', 1);

// Middleware
app.use((req, res, next) => {
    req.io = io;
    next();
});

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10000,
    standardHeaders: true,
    legacyHeaders: false,
});

const userAuthLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: { error: "Too many login attempts for this account. Please try again in an hour." },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body.username || req.ip,
    validate: { xForwardedForHeader: false },
});

const ipAuthLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 300,
    message: { error: "Too many login attempts from this network. Please try again in an hour." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://kit.fontawesome.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://kit.fontawesome.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://ka-f.fontawesome.com"],
            imgSrc: ["'self'", "data:", "https://*"],
            connectSrc: ["'self'", "https://*", "wss://*", "ws://*"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: false,
        preload: false
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(bodyParser.json());

// Routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const registrationRoutes = require('./src/routes/registrationRoutes');
const agentRoutes = require('./src/routes/agentRoutes');

app.use('/api', globalLimiter);

// Specific protection for login
app.use('/api/login', ipAuthLimiter);
app.use('/api/login', userAuthLimiter);

app.use('/api', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', paymentRoutes);
app.use('/api', registrationRoutes);
app.use('/api/super', superAdminRoutes);
app.use('/api', adminRoutes);
app.use('/api', agentRoutes);

app.use(express.static(path.join(__dirname, '../client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});