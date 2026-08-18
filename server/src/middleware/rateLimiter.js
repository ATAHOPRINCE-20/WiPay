const rateLimit = require('express-rate-limit');

// General Limiter: 1000 requests per 15 minutes (Relaxed for Dev)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again later.'
    }
});

// Strict Limiter (for Auth): 100 requests per 15 minutes (Relaxed for Dev)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many login attempts, please try again later.'
    }
});

module.exports = { limiter, authLimiter };
