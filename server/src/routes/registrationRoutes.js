const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { sendOTP, sendRegistrationNotification } = require('../utils/email');
const crypto = require('crypto');

console.log('RegistrationRoutes loading...');
router.get('/reg-debug', (req, res) => res.json({ status: 'registration-router-active' }));
console.log('RegistrationRoutes: /reg-debug route initialized.');

// @route   POST /api/register-request
// @desc    Submit a new client registration request -> Send OTP
// @access  Public
router.post('/register-request', async (req, res) => {
    console.log('===> HIT registration handler');
    console.log('Full Body:', req.body);
    const {
        first_name, last_name, email, phone_number, whatsapp_number,
        hotspot_name, customer_care_contacts, device_type, login_method,
        address, system_usage
    } = req.body;

    if (!first_name || !last_name || !email || !phone_number || !hotspot_name) {
        return res.status(400).json({ error: 'Please fill in all required fields.' });
    }

    try {
        // 1. Generate OTP
        const otpCode = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        // 2. Insert into DB (Status: pending_otp)
        const query = `
            INSERT INTO registration_requests (
                first_name, last_name, email, phone_number, whatsapp_number, 
                hotspot_name, customer_care_contacts, device_type, login_method, 
                address, system_usage, status, otp_code, otp_expiry
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_otp', ?, ?)
        `;

        const values = [
            first_name, last_name, email, phone_number, whatsapp_number,
            hotspot_name, customer_care_contacts, device_type, login_method,
            address, system_usage, otpCode, otpExpiry
        ];

        await db.query(query, values);

        // 3. Send Email
        const sent = await sendOTP(email, otpCode);
        
        if (sent) {
            res.status(201).json({ 
                message: 'OTP sent to your email. Please verify to complete request.',
                email: email 
            });
        } else {
            console.error('Failed to send OTP email');
            // Allow retry? or manual verify?
            res.status(201).json({ 
                message: 'Request saved, but failed to send email. Contact admin.',
                warning: 'Email failure'
            });
        }

    } catch (err) {
        console.error('Registration Request Error:', err);
        res.status(500).json({ error: 'Database error. Please try again later.' });
    }
});

// @route   POST /api/verify-registration-otp
// @desc    Verify OTP and change status to pending_approval
router.post('/verify-registration-otp', (req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} STARTED`);
    if (req.method === 'POST') console.log('Body snippet:', JSON.stringify(req.body).substring(0, 100));
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} FINISHED in ${duration}ms with status ${res.statusCode}`);
    });
    next();
}, async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

    try {
        // Check DB
        const [rows] = await db.query(
            'SELECT * FROM registration_requests WHERE email = ? AND status = "pending_otp" ORDER BY id DESC LIMIT 1', 
            [email]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'No pending request found for this email.' });
        }

        const request = rows[0];

        // Validate OTP
        if (request.otp_code !== otp) {
            return res.status(400).json({ error: 'Invalid OTP code.' });
        }

        // Validate Expiry
        if (new Date() > new Date(request.otp_expiry)) {
            return res.status(400).json({ error: 'OTP has expired. Please register again.' });
        }

        // Success -> Update Status
        await db.query(
            'UPDATE registration_requests SET status = "pending_approval", otp_code = NULL, otp_expiry = NULL WHERE id = ?',
            [request.id]
        );

        // Send notification to admin about new registration
        const adminEmail = process.env.ADMIN_EMAIL || 'payments@ugpay.tech';
        await sendRegistrationNotification(adminEmail, request);

        res.json({ message: 'Email verified! Your request is now pending admin approval.' });

    } catch (err) {
        console.error('OTP Verification Error:', err);
        res.status(500).json({ error: 'Server error during verification.' });
    }
});

module.exports = router;
