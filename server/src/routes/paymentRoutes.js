const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const sessionStore = require('../config/session');
const { sendSMS } = require('../utils/sms');
const { validateMobileNumber } = require('../../validateMobile');
const { sendPaymentNotification, sendSMSPurchaseNotification, sendWithdrawalOTP, sendWithdrawalNotification, sendLowSMSBalanceWarning } = require('../utils/email');
const { authenticateToken, verifyAdmin } = require('../middleware/auth');
const { idempotencyMiddleware, requireIdempotency } = require('../middleware/idempotency');
const { logTransaction } = require('../utils/logger');
const { addHotspotUser } = require('../utils/routerController');
const path = require('path');
require('dotenv').config();

const RELWORX_API_URL = 'https://payments.relworx.com/api/mobile-money/request-payment';
const RELWORX_SEND_PAYMENT_URL = 'https://payments.relworx.com/api/mobile-money/send-payment';
const RELWORX_API_KEY = process.env.RELWORX_API_KEY;
const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;
const WITHDRAWAL_FEE = Number(process.env.WITHDRAW_FEE);

async function getAdminBalance(adminId) {
    try {
        const [transStats] = await db.query("SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as total_revenue FROM transactions WHERE status = 'success' AND admin_id = ?", [adminId]);
        const [withdrawStats] = await db.query("SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0) as total_withdrawn FROM withdrawals WHERE (status='success' OR status='pending') AND admin_id = ?", [adminId]);
        const totalRev = Number(transStats[0].total_revenue);
        const totalWd = Number(withdrawStats[0].total_withdrawn);
        const bal = totalRev - totalWd;
        console.log(`[BALANCE] Admin ${adminId}: Rev=${totalRev}, Wd=${totalWd}, Bal=${bal}`);
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
router.post('/purchase', idempotencyMiddleware, async (req, res) => {
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
            INSERT INTO transactions (transaction_ref, phone_number, customer_name, amount, package_id, package_name, status, admin_id, router_id)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `, [reference, formattedPhone, null, selectedPackage.price, package_id, selectedPackage.name, selectedPackage.admin_id, router_id || null]);


        const response = await axios.post(RELWORX_API_URL, {
            account_no: RELWORX_ACCOUNT_NO,
            reference: reference,
            msisdn: formattedPhone, // Keep + for MTN/Airtel collection
            currency: 'UGX',
            amount: Math.round(Number(selectedPackage.price)), // Round to integer
            description: `Voucher: ${selectedPackage.name}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            }
        });

        const paymentData = response.data;
        console.log(`[PURCHASE] Relworx Response for ${reference}:`, JSON.stringify(paymentData, null, 2));
        logTransaction('INITIATION', 'pending', reference, { phone: formattedPhone, amount: selectedPackage.price, gateway_response: paymentData });

        res.json({
            message: 'Payment request sent. Check PIN prompt.',
            transaction_id: reference,
            status: 'pending'
        });

        // Background Name Capture (Triggered after response to speed up PIN prompt)
        (async () => {
            try {
                const validation = await validateMobileNumber(formattedPhone);
                if (validation && (validation.success || validation.status === 'success')) {
                    const name = validation.customer_name || validation.name;
                    if (name) {
                        await db.query('UPDATE transactions SET customer_name = ? WHERE transaction_ref = ?', [name, reference]);
                        console.log(`[PURCHASE] Post-response name capture success for ${reference}: ${name}`);
                    }
                }
            } catch (err) {
                console.error(`[PURCHASE] Post-response name capture failed for ${reference}:`, err.message);
            }
        })();
    } catch (err) {
        console.error('[PURCHASE] Error:', err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
        
        let errorData = err.response ? err.response.data : { error: err.message };
        
        // If the error data is a string (possibly HTML from Nginx/Gateway/WAF)
        if (typeof errorData === 'string' && (errorData.includes('<html>') || errorData.includes('nginx'))) {
            errorData = { 
                success: false, 
                message: "Payment Gateway returned a system error (502/503). Service may be down.",
                error_type: "gateway_html_error"
            };
        }

        logTransaction('INITIATION_ERROR', 'error', 'N/A', { error: errorData });
        
        // Attempt to mark as failed in DB
        try {
            if (err.config && err.config.data) {
                const body = JSON.parse(err.config.data);
                if (body.reference) {
                    await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', 
                        [JSON.stringify(errorData), body.reference]);
                }
            }
        } catch (dbErr) {
            console.error('[PURCHASE] Failed to log failure:', dbErr.message);
        }
        
        res.status(err.response ? err.response.status : 500).json({ 
            error: 'Payment gateway error', 
            details: errorData 
        });
    }
});

// Webhook Endpoint (Relworx callbacks)
router.post('/webhook', idempotencyMiddleware, async (req, res) => {
    const data = req.body;
    console.log('[WEBHOOK] FULL PAYLOAD:', JSON.stringify(data));

    const status = (data.status || '').toLowerCase();
    const reference = data.reference || data.payment_reference || data.customer_reference || data.external_reference;

    logTransaction('WEBHOOK', status || 'unknown', reference || 'no_ref', data);

    if (!reference) {
        console.error('[WEBHOOK] Missing reference in payload');
        return res.status(400).send('No reference provided');
    }

    // --- HANDLE SMS TOPUP (SMS- Prefix) ---
    if (reference.startsWith('SMS-')) {
        if (status === 'success' || status === 'successful') {
            await db.query('UPDATE sms_fees SET status = "success", webhook_data = ? WHERE reference = ?', [JSON.stringify(data), reference]);
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
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Check if already handled (Lock row to prevent double-processing)
            const [txs] = await connection.query('SELECT * FROM transactions WHERE transaction_ref = ? FOR UPDATE', [reference]);
            if (txs.length === 0) {
                await connection.rollback();
                return res.status(404).send('Transaction not found');
            }

            const tx = txs[0];
            if (tx.status === 'success') {
                await connection.rollback();
                return res.status(200).send('Already processed');
            }

            // 2. Fetch Package Info
            const [packages] = await connection.query('SELECT * FROM packages WHERE id = ?', [tx.package_id]);
            if (packages.length === 0) {
                 await connection.rollback();
                 return res.status(404).send('Package not found');
            }
            const pkg = packages[0];
            const SMS_COST = 35;

            // 3. Calculate Fee
            let feeMs = 0;
            const [admins] = await connection.query('SELECT billing_type, username, email FROM admins WHERE id = ?', [tx.admin_id]);
            const admin = admins[0];
            
            if (admin && admin.billing_type === 'commission') {
                feeMs = tx.amount * 0.05;
            }

            // 4. Get Available Voucher (ATOMIC LOCK)
            const [vouchers] = await connection.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE AND admin_id = ? LIMIT 1 FOR UPDATE', [pkg.id, pkg.admin_id]);
            if (vouchers.length === 0) {
                 await connection.rollback();
                 console.error(`[WEBHOOK] No vouchers available for ${reference}`);
                 return res.status(200).send('No Voucher Available');
            }
            const voucher = vouchers[0];
            const validity_string = voucher.validity || null;

            // 5. Check SMS Balance
            const [balRows] = await connection.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [pkg.admin_id]);
            const balance = Number(balRows[0].balance || 0);

            // 6. Update Voucher & Transaction
            const webName = data.customer_name || data.name || data.msisdn_name;
            await connection.query('UPDATE vouchers SET is_used = 1, used_by = ? WHERE id = ?', [tx.phone_number, voucher.id]);
            
            const successStatus = 'success';
            await connection.query(`
                UPDATE transactions 
                SET status = ?, fee = ?, voucher_code = ?, webhook_data = ?, 
                    customer_name = COALESCE(customer_name, ?) 
                WHERE transaction_ref = ?`, 
                [successStatus, feeMs, voucher.code, JSON.stringify(data), webName, reference]);

            let smsSent = false;
            if (balance >= SMS_COST) {
                await connection.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                    [pkg.admin_id, -SMS_COST, `Voucher Sale: ${voucher.code}`]);
                smsSent = true;
            } else {
                 console.warn(`[WEBHOOK] Insufficient SMS Balance (${balance}) for Admin ${pkg.admin_id}. SMS Skipped.`);
            }

            await connection.commit();

            // --- SYNC TO MIKROTIK ---
            try {
                await addHotspotUser({
                    name: voucher.code,
                    password: voucher.code,
                    router_id: pkg.router_id,
                    validity_hours: pkg.validity_hours,
                    validity_string: validity_string
                });
            } catch (routerErr) {
                console.error(`[WEBHOOK] MikroTik Sync Error (Ref: ${reference}):`, routerErr.message);
            }

            // --- POST-COMMIT ACTIONS (Non-Blocking) ---
            req.io.emit('data_update', { type: 'payments' });
            req.io.emit('data_update', { type: 'vouchers' });
            
            if (smsSent) {
                req.io.emit('data_update', { type: 'sms' });
                req.io.emit('data_update', { type: 'sms_logs' });
                
                // Send SMS (Async)
                const msg = `Payment Received! Your voucher code: ${voucher.code}. Valid for ${pkg.validity_hours} hrs.`;
                sendSMS(tx.phone_number, msg, pkg.admin_id).then(success => {
                    if (!success) {
                         // Refund if failed (outside transaction, separate action)
                         db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "refund", ?, "success")',
                                [pkg.admin_id, SMS_COST, `Refund: SMS Failed (Ref: ${reference})`]).catch(e => console.error(e));
                    }
                });
            } else {
                 // Low Balance Warning (Email)
                 if (admin && admin.email) {
                     sendLowSMSBalanceWarning(admin.email, balance, admin.username);
                 }
            }

            // Email Notification (Always)
            if (admin && admin.email) {
                getAdminBalance(tx.admin_id).then(bal => {
                     sendPaymentNotification(admin.email, tx.amount, tx.phone_number, reference, voucher.code, bal, admin.username);
                });
            }

            res.status(200).send('OK');

        } catch (err) {
            await connection.rollback();
            console.error('[WEBHOOK] Error:', err);
            res.status(500).send('Server Error');
        } finally {
            connection.release();
        }
    } else if (status === 'failed') {
        await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', [JSON.stringify(data), reference]);
        console.log(`[WEBHOOK] Transaction failed: ${reference} - Reason: ${data.message || 'Unknown'}`);
        res.status(200).send('OK');
    } else {
        console.log(`[WEBHOOK] Status ignored: ${status}`);
        res.status(200).send('OK');
    }
});

// Sync Polling Endpoint
router.post('/check-payment-status', idempotencyMiddleware, async (req, res) => {
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
                await db.query('UPDATE sms_fees SET status = "success", webhook_data = ? WHERE reference = ?', [JSON.stringify(data), transaction_ref]);
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
                    await db.query('UPDATE transactions SET status = "success", webhook_data = ? WHERE transaction_ref = ?', [JSON.stringify(data), transaction_ref]);
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

                    await db.query('UPDATE transactions SET status = "success", fee = ?, webhook_data = ? WHERE transaction_ref = ?', [feeMs, JSON.stringify(data), transaction_ref]);

                    // Assign Voucher
                    const [availableVouchers] = await db.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE LIMIT 1', [tx.package_id]);

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];
                        await db.query('UPDATE vouchers SET is_used = TRUE WHERE id = ?', [voucher.id]);
                        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                            [pkg.admin_id, -SMS_COST, `Voucher Sale: ${voucher.code}`]);
                        await db.query('UPDATE transactions SET voucher_code = ? WHERE transaction_ref = ?', [voucher.code, transaction_ref]);

                        // --- SYNC TO MIKROTIK (POLL) ---
                        try {
                            await addHotspotUser({
                                name: voucher.code,
                                password: voucher.code,
                                router_id: tx.router_id,
                                validity_hours: pkg.validity_hours,
                                validity_string: voucher.validity
                            });
                        } catch (routerErr) {
                            console.error(`[POLL] MikroTik Sync Error (Ref: ${transaction_ref}):`, routerErr.message);
                        }

                        // Send SMS
                        const msg = `Payment Received! Your voucher code: ${voucher.code}. Valid for ${pkg.validity_hours} hrs.`;
                        await sendSMS(tx.phone_number, msg, pkg.admin_id);

                        req.io.emit('data_update', { type: 'vouchers' });
                        req.io.emit('data_update', { type: 'payments' });
                        req.io.emit('data_update', { type: 'sms' });

                        // Email Notification (Polling)
                        try {
                            const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [pkg.admin_id]);
                            if (adminRows.length > 0) {
                                const moneyBal = await getAdminBalance(pkg.admin_id);
                                sendPaymentNotification(adminRows[0].email, tx.amount, tx.phone_number, transaction_ref, voucher.code, moneyBal, adminRows[0].username);

                                // Low Balance Check
                                const newBalance = balance - SMS_COST;
                                if (newBalance <= 1000) {
                                    sendLowSMSBalanceWarning(adminRows[0].email, newBalance, adminRows[0].username);
                                }
                            }
                        } catch (emailErr) { console.error('Email Error (Poll):', emailErr); }

                        return res.json({ status: 'SUCCESS', voucher_code: voucher.code });
                    }
                } else {
                    console.warn(`[POLL] Low SMS Balance: ${balance}. Transaction SUCCESS but SMS Skipped.`);

                    // Mark as SUCCESS so user gets voucher
                    let feeMs = 0;
                    const [admins] = await db.query('SELECT billing_type FROM admins WHERE id = ?', [pkg.admin_id]);
                    if (admins.length > 0 && admins[0].billing_type === 'commission') {
                        feeMs = tx.amount * 0.05;
                    }

                    // Assign Voucher
                    const [availableVouchers] = await db.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE LIMIT 1', [tx.package_id]);

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];
                        await db.query('UPDATE vouchers SET is_used = TRUE WHERE id = ?', [voucher.id]);
                        // NO SMS FEE DEDUCTION

                        await db.query('UPDATE transactions SET status = "success", fee = ?, voucher_code = ?, webhook_data = ? WHERE transaction_ref = ?', [feeMs, voucher.code, JSON.stringify(data), transaction_ref]);

                        // --- SYNC TO MIKROTIK (POLL - LOW SMS) ---
                        try {
                            await addHotspotUser({
                                name: voucher.code,
                                password: voucher.code,
                                router_id: tx.router_id,
                                validity_hours: pkg.validity_hours,
                                validity_string: voucher.validity
                            });
                        } catch (routerErr) {
                            console.error(`[POLL] MikroTik Sync Error (Low SMS, Ref: ${transaction_ref}):`, routerErr.message);
                        }

                        req.io.emit('data_update', { type: 'vouchers' });
                        req.io.emit('data_update', { type: 'payments' });

                        // Skip SMS Sending, Log it
                        console.log(`[POLL] SMS skipped due to low balance.`);

                        // Email Notification (Polling - Low Balance)
                        try {
                            const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [pkg.admin_id]);
                            if (adminRows.length > 0) {
                                sendPaymentNotification(adminRows[0].email, tx.amount, tx.phone_number, transaction_ref, voucher.code, null, adminRows[0].username);
                                sendLowSMSBalanceWarning(adminRows[0].email, balance, adminRows[0].username);
                            }
                        } catch (emailErr) { console.error('Email Error (Poll Low Bal):', emailErr); }

                        return res.json({ status: 'SUCCESS', voucher_code: voucher.code });
                    } else {
                        console.error(`[POLL] No vouchers available for ${transaction_ref}`);
                        await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', [JSON.stringify(data), transaction_ref]);
                        return res.json({ status: 'FAILED' });
                    }
                }
            }
        }

        if (isFailed) {
            console.log('[POLL] Gateway says FAILED');
            if (isSMS) await db.query('UPDATE sms_fees SET status = "failed", webhook_data = ? WHERE reference = ?', [JSON.stringify(data), transaction_ref]);
            else await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', [JSON.stringify(data), transaction_ref]);
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
router.post('/admin/withdraw/initiate', verifyAdmin, requireIdempotency, async (req, res) => {
    const { amount, phone_number } = req.body;
    if (!amount || !phone_number) return res.status(400).json({ error: 'Required fields missing' });

    try {
        // 1. Check Balance
        const currentBalance = await getAdminBalance(req.user.id);
        const withdrawable = Math.max(0, currentBalance - WITHDRAWAL_FEE);

        if (Number(amount) > withdrawable) {
            return res.status(400).json({ error: 'Insufficient funds', message: `Max Withdrawable: ${withdrawable} (Fee: ${WITHDRAWAL_FEE})` });
        }

        // 2. Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        // 3. Save to DB
        await db.query('UPDATE admins SET withdrawal_otp = ?, withdrawal_otp_expiry = ? WHERE id = ?', [otp, expiry, req.user.id]);

        // 4. Send SMS & Email
        const msg = `Your UGPAY withdrawal authorization code is: ${otp}. Valid for 5 minutes.`;
        await sendSMS(phone_number, msg, req.user.id);
        
        // Also send via Email (Brevo)
        try {
            const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [req.user.id]);
            if (adminRows.length > 0 && adminRows[0].email) {
                await sendWithdrawalOTP(adminRows[0].email, otp, adminRows[0].username);
            }
        } catch (emailErr) {
            console.error('Withdrawal OTP Email Error:', emailErr);
        }

        res.json({ message: 'OTP sent to SMS and Email', step: 'otp' });

    } catch (err) {
        console.error('Initiate Withdraw Error:', err);
        res.status(500).json({ error: 'Failed to initiate withdrawal' });
    }
});

// Admin Withdraw (Confirm)
router.post('/admin/withdraw', verifyAdmin, requireIdempotency, async (req, res) => {
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
        const [transStats] = await db.query("SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as total_revenue FROM transactions WHERE status = 'success' AND admin_id = ?", [req.user.id]);

        // Count both success AND pending to prevent race condition double-transfers
        const [withdrawStats] = await db.query("SELECT COALESCE(SUM(amount + COALESCE(fee, 0)), 0) as total_withdrawn FROM withdrawals WHERE (status = 'success' OR status = 'pending') AND admin_id = ?", [req.user.id]);

        const currentBalance = Number(transStats[0].total_revenue) - Number(withdrawStats[0].total_withdrawn);

        if (Number(amount) > currentBalance) {
            return res.status(400).json({ error: 'Insufficient funds', message: `Balance: ${currentBalance} (includes pending withdrawals)` });
        }

        // 3. Create Pending Record (LOCK FUNDS LOGICALLY)
        const reference = `W-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await db.query(
            'INSERT INTO withdrawals (phone_number, amount, fee, reference, description, admin_id, status) VALUES (?, ?, ?, ?, ?, ?, "pending")',
            [formattedPhone, amount, WITHDRAWAL_FEE, reference, description, req.user.id]
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
            description: description ? `${description} (Fee: 2000)` : 'Admin Withdrawal (Fee: 2000)'
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

router.get('/admin/my-transactions', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                created_at, 
                'Withdrawal' as type, 
                amount, 
                'success' as status, 
                reference, 
                CONCAT(description, ' (Fee: 2000)') as description 
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

// Admin SMS Balance


module.exports = router;
