const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const transactionLogPath = path.join(logDir, 'transactions.log');

/**
 * Logs a transaction event with a timestamp.
 * @param {string} type - The type of event (PURCHASE, WEBHOOK, POLL, etc.)
 * @param {string} status - success, failed, pending, etc.
 * @param {string} reference - The transaction reference.
 * @param {object} details - Additional data to log.
 */
function logTransaction(type, status, reference, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        status,
        reference,
        details
    };

    const formattedLog = `[${timestamp}] [${type}] [${status.toUpperCase()}] Ref: ${reference} - ${JSON.stringify(details)}\n`;

    fs.appendFileSync(transactionLogPath, formattedLog);
}

module.exports = { logTransaction };
