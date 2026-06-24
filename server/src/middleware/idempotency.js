const crypto = require('crypto');
const db = require('../config/db');

/**
 * Idempotency Middleware
 * Prevents duplicate processing of the same request
 * Requires 'Idempotency-Key' header in request
 */
async function idempotencyMiddleware(req, res, next) {
    const idempotencyKey = req.headers['idempotency-key'];
    
    // Skip if no key provided
    if (!idempotencyKey) {
        return next();
    }

    try {
        // Create request hash from body for duplicate detection
        const requestHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(req.body))
            .digest('hex');

        const endpoint = req.path;
        const method = req.method;
        const userId = req.user?.id || null;

        // Check if this request was already processed
        const [existingRecords] = await db.query(
            `SELECT status_code, response_body FROM idempotency_keys 
             WHERE idempotency_key = ? AND expires_at > NOW()`,
            [idempotencyKey]
        );

        if (existingRecords.length > 0) {
            const record = existingRecords[0];
            console.log(`[IDEMPOTENCY] Duplicate request detected. Key: ${idempotencyKey}`);
            
            // Return cached response
            const statusCode = record.status_code || 200;
            const responseBody = JSON.parse(record.response_body || '{}');
            
            res.status(statusCode).json({
                ...responseBody,
                _cached: true,
                _idempotencyKey: idempotencyKey
            });
            return;
        }

        // Store original response method
        const originalJson = res.json;
        const originalStatus = res.status;
        let statusCode = 200;

        // Override res.status to capture status code
        res.status = function(code) {
            statusCode = code;
            return originalStatus.call(this, code);
        };

        // Override res.json to capture response and store in idempotency table
        res.json = function(data) {
            // Store the idempotency key and response
            db.query(
                `INSERT INTO idempotency_keys 
                 (idempotency_key, user_id, endpoint, method, request_hash, status_code, response_body, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
                [
                    idempotencyKey,
                    userId,
                    endpoint,
                    method,
                    requestHash,
                    statusCode,
                    JSON.stringify(data)
                ]
            ).catch(err => {
                // If unique constraint fails, it's likely a race condition
                if (err.code === 'ER_DUP_ENTRY') {
                    console.warn(`[IDEMPOTENCY] Race condition detected for key: ${idempotencyKey}`);
                } else {
                    console.error('[IDEMPOTENCY] Failed to store response:', err);
                }
            });

            // Call original json method
            return originalJson.call(this, data);
        };

        // Attach idempotency key to request for logging
        req.idempotencyKey = idempotencyKey;
        next();

    } catch (err) {
        console.error('[IDEMPOTENCY] Middleware error:', err);
        // Don't break the request on middleware error, just log it
        next();
    }
}

/**
 * Force idempotency check - throws error if no key provided
 */
async function requireIdempotency(req, res, next) {
    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey) {
        return res.status(400).json({
            error: 'Idempotency-Key header is required for this endpoint',
            example: 'Idempotency-Key: unique-request-id-12345'
        });
    }

    idempotencyMiddleware(req, res, next);
}

module.exports = {
    idempotencyMiddleware,
    requireIdempotency
};
