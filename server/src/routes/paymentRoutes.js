const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sessionStore = require('../config/session');
const { sendSMS } = require('../utils/sms');
const { sendPaymentNotification, sendSMSPurchaseNotification, sendWithdrawalOTP, sendWithdrawalNotification, sendLowSMSBalanceWarning } = require('../utils/email');
const { authenticateToken } = require('../middleware/auth');
const { syncVoucherToRadius } = require('../utils/radius');
require('dotenv').config();

const RELWORX_API_URL = 'https://payments.relworx.com/api/mobile-money/request-payment';
const RELWORX_SEND_PAYMENT_URL = 'https://payments.relworx.com/api/mobile-money/send-payment';
const RELWORX_API_KEY = process.env.RELWORX_API_KEY;
const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;

async function getAdminBalance(adminId) {
    try {
        const [transStats] = await db.query("SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as total_revenue FROM transactions WHERE status = 'success' AND admin_id = ?", [adminId]);
        const [withdrawStats] = await db.query("SELECT COALESCE(SUM(amount), 0) as total_withdrawn FROM withdrawals WHERE (status = 'success' OR status = 'pending') AND admin_id = ?", [adminId]);
        const bal = Number(transStats[0].total_revenue) - Number(withdrawStats[0].total_withdrawn);
        console.log(`[BALANCE] Admin ${adminId}: Rev=${transStats[0].total_revenue}, Wd=${withdrawStats[0].total_withdrawn}, Bal=${bal}`);
        return bal;
    } catch (e) {
        console.error('Error fetching balance:', e);
        return 0;
    }
}

function grantAccess(phoneNumber, durationHours) {
    console.log(`[GATEWAY] Granting access to ${phoneNumber} for ${durationHours} hours.`);
    return true; // Used to trigger router API
}

// Purchase Initiation
router.post('/purchase', async (req, res) => {
    const { phone_number, package_id, router_id } = req.body; // Added router_id

    if (!phone_number || !package_id) return res.status(400).json({ error: 'Phone number and package ID required.' });

    try {
        const [packages] = await db.query('SELECT * FROM packages WHERE id = ?', [package_id]);
        if (packages.length === 0) return res.status(404).json({ error: 'Package not found.' });
        const selectedPackage = packages[0];

        const [vouchers] = await db.query('SELECT count(*) as count FROM vouchers WHERE package_id = ? AND is_used = 0', [package_id]);
        if (vouchers[0].count === 0) return res.status(400).json({ error: 'No vouchers available.' });

        const reference = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        let formattedPhone = phone_number.trim();
        if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

        console.log(`[GATEWAY] Payment for ${formattedPhone}, Amount: ${selectedPackage.price}, Router: ${router_id || 'N/A'}`);

        await db.query(`
            INSERT INTO transactions (transaction_ref, phone_number, amount, package_id, status, admin_id, router_id)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `, [reference, formattedPhone, selectedPackage.price, package_id, selectedPackage.admin_id, router_id || null]);

        const response = await fetch(RELWORX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            },
            body: JSON.stringify({
                account_no: RELWORX_ACCOUNT_NO,
                reference: reference,
                msisdn: formattedPhone,
                currency: 'UGX',
                amount: Number(selectedPackage.price),
                description: `Payment for ${selectedPackage.name}`
            })
        });

        const paymentData = await response.json();
        console.log(`[PURCHASE] Relworx Response for ${reference}:`, JSON.stringify(paymentData, null, 2));

        if (response.ok) {
            res.json({
                message: 'Payment request sent. Check PIN prompt.',
                transaction_id: reference,
                status: 'pending'
            });
        } else {
            console.error('[Purchase] Gateway Failed:', JSON.stringify(paymentData, null, 2));
            await db.query('UPDATE transactions SET status = "failed" WHERE transaction_ref = ?', [reference]);
            res.status(400).json({ error: 'Payment gateway failed', details: paymentData });
        }
    } catch (err) {
        console.error('Purchase error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Webhook Endpoint (Relworx callbacks)
router.post('/webhook', async (req, res) => {
    const data = req.body;
    console.log('[WEBHOOK] Received:', JSON.stringify(data));

    // Relworx structure usually sends { status: 'success', reference: '...', ... }
    // Ensure we handle different potential structures or verify signature if possible.
    // For now, checks status and reference.

    const status = (data.status || '').toLowerCase();
    const reference = data.reference || data.payment_reference;

    if (!reference) return res.status(400).send('No reference provided');

    // --- HANDLE SMS TOPUP (SMS- Prefix) ---
    if (reference.startsWith('SMS-')) {
        if (status === 'success' || status === 'successful') {
            await db.query('UPDATE sms_fees SET status = "success" WHERE reference = ?', [reference]);
            console.log(`[WEBHOOK] SMS Topup Successful: ${reference}`);

            // Email Notification
            try {
                // Find who made this payment? sms_fees usually has admin_id
                const [smsRows] = await db.query('SELECT admin_id, amount, credits FROM sms_fees WHERE reference = ?', [reference]);
                if (smsRows.length > 0) {
                    const adminId = smsRows[0].admin_id;
                    const balance = await getAdminBalance(adminId);
                    const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [adminId]);
                    if (adminRows.length > 0 && adminRows[0].email) {
                        sendSMSPurchaseNotification(adminRows[0].email, smsRows[0].amount, smsRows[0].credits, reference, balance, adminRows[0].username);
                    }
                }
            } catch (smsEmailErr) { console.error('SMS Email Error', smsEmailErr); }

        } else if (status === 'failed') {
            await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [reference]);
            console.log(`[WEBHOOK] SMS Topup Failed: ${reference}`);
        }
        return res.status(200).send('OK');
    }

    // --- HANDLE STANDARD TRANSACTIONS ---
    if (status === 'success' || status === 'successful') {
        try {
            // Check if already handled
            const [txs] = await db.query('SELECT * FROM transactions WHERE transaction_ref = ?', [reference]);
            if (txs.length === 0) return res.status(404).send('Transaction not found');

            const tx = txs[0];
            if (tx.status === 'success') return res.status(200).send('Already processed');

            // Fetch Admin Billing Type to calculate Fee
            // Assign Voucher Logic
            const [packages] = await db.query('SELECT * FROM packages WHERE id = ?', [tx.package_id]);
            if (packages.length > 0) {
                const pkg = packages[0];
                const SMS_COST = 35;

                // 1. Check SMS Balance
                const [balRows] = await db.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [pkg.admin_id]);
                const balance = Number(balRows[0].balance || 0);

                if (balance >= SMS_COST) {
                    // MARK AS SUCCESS ONLY IF BALANCE IS SUFFICIENT
                    // Calculate Fee first
                    let feeMs = 0;
                    const [admins] = await db.query('SELECT billing_type FROM admins WHERE id = ?', [pkg.admin_id]);
                    if (admins.length > 0 && admins[0].billing_type === 'commission') {
                        feeMs = tx.amount * 0.05;
                    }
                    await db.query('UPDATE transactions SET status = "success", fee = ? WHERE transaction_ref = ?', [feeMs, reference]);

                    // Notify Payments Update
                    req.io.emit('data_update', { type: 'payments' });

                    // 2. Get Available Voucher (Bug Fix: Added query)
                    const [availableVouchers] = await db.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE LIMIT 1', [tx.package_id]);

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];

                        // 3. Mark Voucher Used
                        await db.query('UPDATE vouchers SET is_used = TRUE WHERE id = ?', [voucher.id]);

                        // 3b. Sync voucher to RADIUS (for hotspot authentication)
                        syncVoucherToRadius(voucher.code, tx.package_id).catch(err =>
                            console.error(`[RADIUS WEBHOOK] Failed to sync voucher ${voucher.code}:`, err)
                        );

                        // 4. Deduct SMS Fee
                        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                            [pkg.admin_id, -SMS_COST, `Voucher Sale: ${voucher.code}`]);

                        // 5. Store voucher code in transactions
                        await db.query('UPDATE transactions SET voucher_code = ? WHERE transaction_ref = ?', [voucher.code, reference]);

                        req.io.emit('data_update', { type: 'vouchers' });
                        req.io.emit('data_update', { type: 'payments' });

                        // 6. Send SMS and Handle Billing
                        const msg = `Payment Received! Your voucher code: ${voucher.code}. Valid for ${pkg.validity_hours} hrs.`;
                        const smsSuccess = await sendSMS(tx.phone_number, msg, pkg.admin_id); // Await result

                        if (!smsSuccess) {
                            console.warn(`[WEBHOOK] SMS Failed for ${reference}. Refunding Admin ${pkg.admin_id}.`);
                            // REFUND LOGIC
                            await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "refund", ?, "success")',
                                [pkg.admin_id, SMS_COST, `Refund: SMS Failed (Ref: ${reference})`]);
                        } else {
                            console.log(`[WEBHOOK] SMS Sent & Billed for ${reference}`);
                        }

                        req.io.emit('data_update', { type: 'sms' });
                        req.io.emit('data_update', { type: 'sms_logs' });

                        // Email Notification
                        try {
                            const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [pkg.admin_id]);
                            if (adminRows.length > 0) {
                                sendPaymentNotification(adminRows[0].email, tx.amount, tx.phone_number, reference, voucher.code, null, adminRows[0].username);

                                // Low Balance Check
                                const newBalance = balance - SMS_COST;
                                if (newBalance <= 1000) {
                                    sendLowSMSBalanceWarning(adminRows[0].email, newBalance, adminRows[0].username);
                                }
                            }
                        } catch (emailErr) { console.error('Email Error:', emailErr); }
                    } else {
                        console.error(`[WEBHOOK] No vouchers available for ${reference}`);
                    }
                } else {
                    console.warn(`[WEBHOOK] Insufficient SMS Balance (${balance}) for Admin ${pkg.admin_id}. Transaction NOT marked success.`);
                    // OPTIONAL: Mark as failed?
                    await db.query('UPDATE transactions SET status = "failed_low_sms" WHERE transaction_ref = ?', [reference]);
                }
            }
            res.status(200).send('OK');
        } catch (err) {
            console.error('[WEBHOOK] Error:', err);
            res.status(500).send('Server Error');
        }
    } else if (status === 'failed') {
        await db.query('UPDATE transactions SET status = "failed" WHERE transaction_ref = ?', [reference]);
        console.log(`[WEBHOOK] Transaction failed: ${reference}`);
        res.status(200).send('OK');
    } else {
        console.log(`[WEBHOOK] Status ignored: ${status}`);
        res.status(200).send('OK');
    }
});

// Sync Polling Endpoint
router.post('/check-payment-status', async (req, res) => {
    const { transaction_ref } = req.body;
    console.log(`[POLL] Checking Ref: ${transaction_ref}`);

    if (!transaction_ref) return res.status(400).json({ error: 'Ref required' });

    try {
        let isSMS = transaction_ref.startsWith('SMS-');
        let tx = null; // Standard transaction
        let sms = null; // SMS transaction

        // 1. Local DB Check
        if (isSMS) {
            console.log('[POLL] Lookup in sms_fees...');
            const [rows] = await db.query('SELECT * FROM sms_fees WHERE reference = ?', [transaction_ref]);
            if (rows.length === 0) {
                console.log('[POLL] Not found in sms_fees');
                return res.status(404).json({ error: 'SMS Transaction not found' });
            }
            sms = rows[0];
            if (sms.status === 'success') return res.json({ status: 'SUCCESS' });
            if (sms.status === 'failed') return res.json({ status: 'FAILED' });
        } else {
            console.log('[POLL] Lookup in transactions...');
            const [rows] = await db.query('SELECT * FROM transactions WHERE transaction_ref = ?', [transaction_ref]);
            if (rows.length === 0) {
                console.log('[POLL] Not found in transactions');
                return res.status(404).json({ error: 'Transaction not found' });
            }
            tx = rows[0];
            if (tx.status === 'success') return res.json({ status: 'SUCCESS', voucher_code: tx.voucher_code });
            if (tx.status === 'failed') return res.json({ status: 'FAILED' });
            if (tx.status === 'failed_low_sms') return res.json({ status: 'FAILED_LOW_SMS' });
        }

        // 2. Gateway Check
        const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${transaction_ref}&internal_reference=${transaction_ref}`;
        console.log(`[POLL] Asking Gateway: ${checkUrl}`);

        const response = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            }
        });

        const data = await response.json();
        console.log(`[POLL] Gateway says:`, data.status || data.item_status);

        const status = (data.status || '').toUpperCase();
        const itemStatus = (data.item_status || '').toUpperCase();
        const isSuccess = (status === 'SUCCESS' || itemStatus === 'SUCCESS');
        const isFailed = (status === 'FAILED' || itemStatus === 'FAILED');

        if (isSuccess) {
            if (isSMS) {
                // --- SMS SUCCESS LOGIC ---
                console.log('[POLL] SMS Success. Updating DB...');
                await db.query('UPDATE sms_fees SET status = "success" WHERE reference = ?', [transaction_ref]);
                req.io.emit('data_update', { type: 'sms' });
                req.io.emit('data_update', { type: 'sms_logs' });
                // Notify by email
                try {
                    const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [sms.admin_id]);
                    if (adminRows.length > 0) {
                        const bal = await getAdminBalance(sms.admin_id);
                        sendSMSPurchaseNotification(adminRows[0].email, sms.amount, 0, transaction_ref, bal, adminRows[0].username);
                    }
                } catch (e) { console.error(e); }

                return res.json({ status: 'SUCCESS' });

            } else {
                // --- VOUCHER SUCCESS LOGIC ---
                console.log('[POLL] Voucher Success. Updating DB...');

                // Fetch Package Info
                const [packages] = await db.query('SELECT * FROM packages WHERE id = ?', [tx.package_id]);
                if (packages.length === 0) {
                    // Should not happen, but safe fallback
                    await db.query('UPDATE transactions SET status = "success" WHERE transaction_ref = ?', [transaction_ref]);
                    return res.json({ status: 'SUCCESS' });
                }
                const pkg = packages[0];
                const SMS_COST = 35;

                // Check SMS Balance
                const [balRows] = await db.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [pkg.admin_id]);
                const balance = Number(balRows[0].balance || 0);

                if (balance >= SMS_COST) {
                    // Calculate Fee
                    let feeMs = 0;
                    const [admins] = await db.query('SELECT billing_type FROM admins WHERE id = ?', [pkg.admin_id]);
                    if (admins.length > 0 && admins[0].billing_type === 'commission') {
                        feeMs = tx.amount * 0.05;
                    }

                    await db.query('UPDATE transactions SET status = "success", fee = ? WHERE transaction_ref = ?', [feeMs, transaction_ref]);

                    // Assign Voucher
                    const [availableVouchers] = await db.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE LIMIT 1', [tx.package_id]);

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];
                        await db.query('UPDATE vouchers SET is_used = TRUE WHERE id = ?', [voucher.id]);
                        // Sync voucher to RADIUS (for hotspot authentication)
                        syncVoucherToRadius(voucher.code, tx.package_id).catch(err =>
                            console.error(`[RADIUS POLL] Failed to sync voucher ${voucher.code}:`, err)
                        );
                        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                            [pkg.admin_id, -SMS_COST, `Voucher Sale: ${voucher.code}`]);
                        await db.query('UPDATE transactions SET voucher_code = ? WHERE transaction_ref = ?', [voucher.code, transaction_ref]);

                        // Send SMS
                        const msg = `Payment Received! Your voucher code: ${voucher.code}. Valid for ${pkg.validity_hours} hrs.`;
                        await sendSMS(tx.phone_number, msg, pkg.admin_id);

                        req.io.emit('data_update', { type: 'vouchers' });
                        req.io.emit('data_update', { type: 'payments' });
                        req.io.emit('data_update', { type: 'sms' });

                        return res.json({ status: 'SUCCESS', voucher_code: voucher.code });
                    }
                } else {
                    console.warn(`[POLL] Low SMS Balance: ${balance}`);
                    await db.query('UPDATE transactions SET status = "failed_low_sms" WHERE transaction_ref = ?', [transaction_ref]);
                    return res.json({ status: 'FAILED_LOW_SMS' });
                }
            }
        }

        if (isFailed) {
            console.log('[POLL] Gateway says FAILED');
            if (isSMS) await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [transaction_ref]);
            else await db.query('UPDATE transactions SET status = "failed" WHERE transaction_ref = ?', [transaction_ref]);
            return res.json({ status: 'FAILED' });
        }

        // Pending
        return res.json({ status: 'PENDING' });

    } catch (err) {
        console.error('Polling Error:', err);
        res.status(500).json({ error: 'Error checking status' });
    }
});

// Initiate Withdrawal (OTP)
router.post('/admin/withdraw/initiate', authenticateToken, async (req, res) => {
    const { amount, phone_number } = req.body;
    if (!amount || !phone_number) return res.status(400).json({ error: 'Required fields missing' });

    try {
        // 1. Check Balance
        const [transStats] = await db.query("SELECT COALESCE(SUM(amount - fee), 0) as total_revenue FROM transactions WHERE status = 'success' AND admin_id = ?", [req.user.id]);
        const [withdrawStats] = await db.query("SELECT COALESCE(SUM(amount), 0) as total_withdrawn FROM withdrawals WHERE admin_id = ?", [req.user.id]);
        const currentBalance = Number(transStats[0].total_revenue) - Number(withdrawStats[0].total_withdrawn);

        if (Number(amount) > currentBalance) {
            return res.status(400).json({ error: 'Insufficient funds', message: `Balance: ${currentBalance}` });
        }

        // 2. Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        // 3. Save to DB
        await db.query('UPDATE admins SET withdrawal_otp = ?, withdrawal_otp_expiry = ? WHERE id = ?', [otp, expiry, req.user.id]);

        // 4. Send Email
        const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [req.user.id]);
        if (adminRows.length > 0 && adminRows[0].email) {
            sendWithdrawalOTP(adminRows[0].email, otp, adminRows[0].username);
        }

        res.json({ message: 'OTP sent to email', step: 'otp' });

    } catch (err) {
        console.error('Initiate Withdraw Error:', err);
        res.status(500).json({ error: 'Failed to initiate withdrawal' });
    }
});

// Admin Withdraw (Confirm)
router.post('/admin/withdraw', authenticateToken, async (req, res) => {
    const { amount, phone_number, description, otp } = req.body;

    if (!amount || !phone_number || !otp) return res.status(400).json({ error: 'Required fields missing including OTP' });

    try {
        // 1. Verify OTP
        const [rows] = await db.query('SELECT withdrawal_otp, withdrawal_otp_expiry FROM admins WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(401).json({ error: 'Unauthorized' });

        const { withdrawal_otp, withdrawal_otp_expiry } = rows[0];

        if (!withdrawal_otp || withdrawal_otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
        if (new Date() > new Date(withdrawal_otp_expiry)) {
            return res.status(400).json({ error: 'OTP Expired' });
        }

        // 2. Format Phone & Check Balance (Including PENDING withdrawals)
        let formattedPhone = phone_number.trim();
        if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

        // Balance Check: Total Revenue - (Successful Withdrawals + Pending Withdrawals)
        const [transStats] = await db.query("SELECT COALESCE(SUM(amount - fee), 0) as total_revenue FROM transactions WHERE status = 'success' AND admin_id = ?", [req.user.id]);

        // Count both success AND pending to prevent race condition double-transfers
        const [withdrawStats] = await db.query("SELECT COALESCE(SUM(amount), 0) as total_withdrawn FROM withdrawals WHERE (status = 'success' OR status = 'pending') AND admin_id = ?", [req.user.id]);

        const currentBalance = Number(transStats[0].total_revenue) - Number(withdrawStats[0].total_withdrawn);

        if (Number(amount) > currentBalance) {
            return res.status(400).json({ error: 'Insufficient funds', message: `Balance: ${currentBalance} (includes pending withdrawals)` });
        }

        // 3. Create Pending Record (LOCK FUNDS LOGICALLY)
        const reference = `W-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await db.query(
            'INSERT INTO withdrawals (phone_number, amount, reference, description, admin_id, status) VALUES (?, ?, ?, ?, ?, "pending")',
            [formattedPhone, amount, reference, description, req.user.id]
        );

        // 4. Clear OTP
        await db.query('UPDATE admins SET withdrawal_otp = NULL, withdrawal_otp_expiry = NULL WHERE id = ?', [req.user.id]);

        // 5. Process Payment (Gateway)
        const payload = {
            account_no: RELWORX_ACCOUNT_NO,
            reference: reference,
            msisdn: formattedPhone,
            currency: 'UGX',
            amount: Number(amount),
            description: description || 'Admin Withdrawal'
        };

        const response = await fetch(RELWORX_SEND_PAYMENT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log(`[WITHDRAW] Relworx Response for ${reference}:`, JSON.stringify(result, null, 2));

        if (response.ok && (result.success === true || result.status === 'success')) {
            // 6. Success: Update Status
            await db.query('UPDATE withdrawals SET status = "success" WHERE reference = ?', [reference]);

            // Email Notification
            try {
                const balance = await getAdminBalance(req.user.id);
                const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [req.user.id]);
                if (adminRows.length > 0 && adminRows[0].email) {
                    sendWithdrawalNotification(adminRows[0].email, amount, formattedPhone, reference, description || 'Admin Withdrawal', balance, adminRows[0].username);
                }
            } catch (wdEmailErr) { console.error('Withdraw Email Error', wdEmailErr); }

            req.io.emit('data_update', { type: 'withdrawals' });
            res.json({ success: true, data: result });
        } else {
            // 7. Failure: Update Status
            console.warn('[Withdraw] Failed:', result);
            await db.query('UPDATE withdrawals SET status = "failed" WHERE reference = ?', [reference]);
            res.status(400).json({ success: false, error: result.message || 'Failed', details: result });
        }
    } catch (err) {
        console.error('Withdraw Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/admin/my-transactions', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                created_at, 
                'Withdrawal' as type, 
                amount, 
                'success' as status, 
                reference, 
                description 
            FROM withdrawals 
            WHERE admin_id = ?
            
            UNION ALL
            
            SELECT 
                created_at, 
                'Subscription' as type, 
                amount, 
                status, 
                reference, 
                CONCAT('Subscription for ', months, ' months') as description 
            FROM admin_subscriptions 
            WHERE admin_id = ?
            
            ORDER BY created_at DESC
        `;

        const [rows] = await db.query(query, [req.user.id, req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('My Transactions Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Withdrawals history list
router.get('/admin/withdrawals', authenticateToken, async (req, res) => {
    try {
        const query = 'SELECT * FROM withdrawals WHERE admin_id = ? ORDER BY created_at DESC';
        const [rows] = await db.query(query, [req.user.id]);
        res.json(rows);
    } catch (err) {
        console.error('Withdrawals History Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Admin SMS Balance


module.exports = router;
