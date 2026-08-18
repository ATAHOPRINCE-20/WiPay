const db = require('../config/db');
require('dotenv').config();

const UGSMS_API_URL = 'https://ugsms.com/v1/sms/send';
const UGSMS_USERNAME = process.env.UGSMS_USERNAME;
const UGSMS_PASSWORD = process.env.UGSMS_PASSWORD;

async function sendSMS(phoneNumber, message, adminId = null) {
    let status = 'pending';
    let apiResponse = null;

    if (!UGSMS_USERNAME || !UGSMS_PASSWORD) {
        console.warn('[SMS] Credentials missing. Skipping SMS:', { phoneNumber, message });
        status = 'skipped_no_creds';
    } else {
        try {
            let cleanPhone = phoneNumber.replace('+', '');
            const payload = {
                username: UGSMS_USERNAME,
                password: UGSMS_PASSWORD,
                numbers: cleanPhone,
                message_body: message
            };

            const response = await fetch(UGSMS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            apiResponse = JSON.stringify(result);
            status = response.ok ? 'success' : 'failed';

            console.log('[SMS] Response:', result);
        } catch (err) {
            console.error('[SMS] Error sending message:', err);
            status = 'error';
            apiResponse = JSON.stringify({ error: err.message });
        }
    }

    // Log to DB
    try {
        await db.query(
            'INSERT INTO sms_logs (phone_number, message, status, response, admin_id) VALUES (?, ?, ?, ?, ?)',
            [phoneNumber, message, status, apiResponse, adminId]
        );
    } catch (dbErr) {
        console.error('[SMS] Failed to log to DB:', dbErr);
    }

    return status === 'success';
}

module.exports = { sendSMS };
