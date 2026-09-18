const express = require('express');
const router = express.Router();
const db = require('../config/db');
const sessionStore = require('../config/session');
const { sendSMS } = require('../utils/sms');
const { sendPaymentNotification, sendSMSPurchaseNotification, sendWithdrawalOTP, sendWithdrawalNotification, sendLowSMSBalanceWarning } = require('../utils/email');
const { authenticateToken } = require('../middleware/auth');
const { syncVoucherToRadius } = require('../utils/radius');
const { loginHotspotUserOnRouter } = require('../utils/mikrotikApi');
require('dotenv').config();

const RELWORX_API_URL = 'https://payments.relworx.com/api/mobile-money/request-payment';
const RELWORX_SEND_PAYMENT_URL = 'https://payments.relworx.com/api/mobile-money/send-payment';
const RELWORX_API_KEY = process.env.RELWORX_API_KEY;
const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;

const relworxPollCache = new Map();

function formatUgandaMSISDN(phone) {
    if (!phone) return null;
    let digits = phone.toString().replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) {
        digits = '256' + digits.slice(1);
    } else if (digits.length === 9) {
        digits = '256' + digits;
    }
    if (digits.length !== 12 || !digits.startsWith('256')) {
        return null;
    }
    return '+' + digits;
}

async function getAdminBalance(adminId) {
    try {
        const [adminRows] = await db.query(
            "SELECT role, COALESCE(opening_balance, 0.00) as opening_balance, COALESCE(last_settled_at, '1970-01-01 00:00:00') as last_settled_at FROM admins WHERE id = ?",
            [adminId]
        );
        if (adminRows.length === 0) return 0;

        const role = adminRows[0].role;
        const openingBal = Number(adminRows[0].opening_balance || 0);
        const lastSettled = role === 'super_admin' ? '1970-01-01 00:00:00' : (adminRows[0].last_settled_at || '1970-01-01 00:00:00');

        if (role === 'super_admin') {
            const [commStats] = await db.query(
                `SELECT COALESCE(SUM(
                    CASE 
                        WHEN t.fee IS NOT NULL AND t.fee > 0 THEN t.fee
                        WHEN COALESCE(a.billing_type, 'commission') = 'commission' THEN (t.amount * COALESCE(a.commission_rate, 5.00) / 100)
                        ELSE 0
                    END
                 ), 0) as total_commission 
                 FROM transactions t
                 LEFT JOIN admins a ON t.admin_id = a.id
                 WHERE (t.status = 'success' OR t.status = 'SUCCESS') 
                   AND (t.transaction_ref NOT LIKE 'SMS-%' AND t.transaction_ref NOT LIKE 'SUB-%' AND t.transaction_ref NOT LIKE 'W-%')
                   AND t.created_at >= ?`,
                [lastSettled]
            );

            const [subStats] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total_subscriptions 
                 FROM admin_subscriptions 
                 WHERE (status = 'success' OR status = 'SUCCESS')
                   AND created_at >= ?`,
                [lastSettled]
            );

            const [smsStats] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total_sms 
                 FROM sms_fees 
                 WHERE (status = 'success' OR status = 'SUCCESS') 
                   AND type IN ('deposit', 'recharge')
                   AND created_at >= ?`,
                [lastSettled]
            );

            const [withdrawStats] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total_withdrawn 
                 FROM withdrawals 
                 WHERE (status = 'success' OR status = 'pending') 
                   AND admin_id = ? 
                   AND created_at >= ?`,
                [adminId, lastSettled]
            );

            const totalEarnings = Number(commStats[0].total_commission) + Number(subStats[0].total_subscriptions) + Number(smsStats[0].total_sms);
            const totalWithdrawn = Number(withdrawStats[0].total_withdrawn);
            const bal = openingBal + totalEarnings - totalWithdrawn;
            console.log(`[BALANCE] SuperAdmin ${adminId}: Comm=${commStats[0].total_commission}, Sub=${subStats[0].total_subscriptions}, SMS=${smsStats[0].total_sms}, Wd=${totalWithdrawn}, Bal=${bal}`);
            return bal;
        } else {
            const [transStats] = await db.query(
                `SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) as total_revenue 
                 FROM transactions 
                 WHERE (status = 'success' OR status = 'SUCCESS') 
                   AND (payment_method = 'mobile_money' OR payment_method IS NULL OR (payment_method != 'manual' AND payment_method != 'cash' AND payment_method != 'agent')) 
                   AND (transaction_ref NOT LIKE 'SMS-%' AND transaction_ref NOT LIKE 'SUB-%' AND transaction_ref NOT LIKE 'W-%') 
                   AND admin_id = ? 
                   AND created_at >= ?`,
                [adminId, lastSettled]
            );
            const [withdrawStats] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total_withdrawn 
                 FROM withdrawals 
                 WHERE (status = 'success' OR status = 'pending') 
                   AND admin_id = ? 
                   AND created_at >= ?`,
                [adminId, lastSettled]
            );

            const totalRev = Number(transStats[0].total_revenue);
            const totalWithdrawn = Number(withdrawStats[0].total_withdrawn);
            const bal = openingBal + totalRev - totalWithdrawn;
            console.log(`[BALANCE] Tenant Admin ${adminId}: Rev=${totalRev}, Wd=${totalWithdrawn}, Bal=${bal}`);
            return bal;
        }
    } catch (e) {
        console.error('Error fetching balance:', e);
        return 0;
    }
}

function grantAccess(phoneNumber, durationHours) {
    console.log(`[GATEWAY] Granting access to ${phoneNumber} for ${durationHours} hours.`);
    return true; // Used to trigger router API
}

router.post('/purchase', async (req, res) => {
    const { phone_number, package_id, router_id, mac, ip, mac_address, tv_mac } = req.body;
    const targetMac = tv_mac || mac_address || mac || null;

    if (!phone_number || !package_id) return res.status(400).json({ error: 'Phone number and package ID required.' });

    try {
        const [packages] = await db.query('SELECT id, name, price, admin_id, router_id FROM packages WHERE id = ?', [package_id]);
        if (packages.length === 0) return res.status(404).json({ error: 'Package not found.' });
        const selectedPackage = packages[0];

        // Check if admin subscription is active
        const [adminSubRows] = await db.query('SELECT billing_type, subscription_expiry FROM admins WHERE id = ?', [selectedPackage.admin_id]);
        if (adminSubRows.length > 0) {
            const { billing_type, subscription_expiry } = adminSubRows[0];
            if (billing_type === 'subscription' && subscription_expiry && new Date(subscription_expiry) < new Date()) {
                return res.status(403).json({
                    error: 'Network Service Suspended: The network administrator subscription has expired. Online voucher purchases are temporarily disabled.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }
        }

        const [vouchers] = await db.query(
            'SELECT count(*) as count FROM vouchers WHERE package_id = ? AND admin_id = ? AND is_used = 0 AND (status IS NULL OR status != "expired")',
            [package_id, selectedPackage.admin_id]
        );
        if (vouchers[0].count === 0) {
            return res.status(400).json({ error: 'Out of Stock: No unused vouchers available for this package. Please contact the administrator.' });
        }

        const reference = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const formattedPhone = formatUgandaMSISDN(phone_number);
        if (!formattedPhone) return res.status(400).json({ error: 'Invalid phone number format.' });

        console.log(`[GATEWAY] Payment for ${formattedPhone}, Amount: ${selectedPackage.price}, Router: ${router_id || 'N/A'}, MAC: ${targetMac || 'N/A'}`);

        await db.query(`
            INSERT INTO transactions (transaction_ref, phone_number, amount, package_id, status, admin_id, router_id, mac_address, ip_address)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)
        `, [reference, formattedPhone, selectedPackage.price, package_id, selectedPackage.admin_id, router_id || selectedPackage.router_id || null, targetMac || null, ip || null]);

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
            const errorJson = JSON.stringify(paymentData);
            await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', [errorJson, reference]);
            
            const rawMsg = paymentData?.message || paymentData?.error || '';
            let userMsg = 'Payment gateway failed. Please try again.';
            if (response.status === 429 || rawMsg.toLowerCase().includes('too many requests')) {
                userMsg = 'Payment gateway is busy. Please wait 10-15 seconds and try again.';
            } else if (rawMsg) {
                userMsg = rawMsg;
            }
            res.status(response.status === 429 ? 429 : 400).json({ error: userMsg, details: paymentData });
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
    const reference = data.reference || data.customer_reference || data.payment_reference || data.internal_reference;

    if (!reference) return res.status(400).send('No reference provided');

    // --- HANDLE SMS TOPUP (SMS- Prefix) ---
    if (reference.startsWith('SMS-')) {
        if (status === 'success' || status === 'successful') {
            await db.query('UPDATE sms_fees SET status = "success" WHERE reference = ?', [reference]);
            console.log(`[WEBHOOK] SMS Topup Successful: ${reference}`);

            // Email Notification
            try {
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

    // --- HANDLE WITHDRAWALS (W- Prefix) ---
    if (reference.startsWith('W-')) {
        try {
            const [withdrawals] = await db.query('SELECT * FROM withdrawals WHERE reference = ?', [reference]);
            if (withdrawals.length === 0) {
                console.log(`[WEBHOOK] Withdrawal not found for reference: ${reference}`);
                return res.status(404).send('Withdrawal not found');
            }

            const withdrawal = withdrawals[0];
            if (status === 'success' || status === 'successful') {
                if (withdrawal.status !== 'success') {
                    await db.query('UPDATE withdrawals SET status = "success" WHERE reference = ?', [reference]);
                    console.log(`[WEBHOOK] Withdrawal Successful: ${reference}`);

                    // Send email notification
                    try {
                        const balance = await getAdminBalance(withdrawal.admin_id);
                        const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [withdrawal.admin_id]);
                        if (adminRows.length > 0 && adminRows[0].email) {
                            sendWithdrawalNotification(
                                adminRows[0].email,
                                withdrawal.amount,
                                withdrawal.phone_number,
                                reference,
                                withdrawal.description || 'Admin Withdrawal',
                                balance,
                                adminRows[0].username
                            );
                        }
                    } catch (wdEmailErr) {
                        console.error('[WEBHOOK] Withdrawal success email notification error:', wdEmailErr);
                    }

                    req.io.emit('data_update', { type: 'withdrawals' });
                }
            } else if (status === 'failed') {
                const failReason = data.message ? ` (Reason: ${data.message})` : '';
                await db.query('UPDATE withdrawals SET status = "failed", description = CONCAT(COALESCE(description, "Withdrawal"), ?) WHERE reference = ?', [failReason, reference]);
                console.log(`[WEBHOOK] Withdrawal Failed: ${reference}${failReason}`);

                req.io.emit('data_update', { type: 'withdrawals' });
            }
            return res.status(200).send('OK');
        } catch (err) {
            console.error('[WEBHOOK] Withdrawal Webhook Error:', err);
            return res.status(500).send('Server Error');
        }
    }

    // --- HANDLE SUBSCRIPTION RENEWAL (SUB- Prefix) ---
    if (reference.startsWith('SUB-')) {
        try {
            const [subs] = await db.query('SELECT * FROM admin_subscriptions WHERE reference = ?', [reference]);
            if (subs.length === 0) {
                console.log(`[WEBHOOK] Subscription transaction not found for reference: ${reference}`);
                return res.status(404).send('Subscription transaction not found');
            }

            const sub = subs[0];
            if (status === 'success' || status === 'successful') {
                if (sub.status !== 'success') {
                    await db.query('UPDATE admin_subscriptions SET status = "success" WHERE reference = ?', [reference]);

                    // Update Admin Expiry
                    const [adminRows] = await db.query('SELECT subscription_expiry FROM admins WHERE id = ?', [sub.admin_id]);
                    if (adminRows.length > 0) {
                        let currentExpiry = adminRows[0].subscription_expiry ? new Date(adminRows[0].subscription_expiry) : new Date();
                        const now = new Date();
                        if (currentExpiry < now) currentExpiry = now;
                        currentExpiry.setMonth(currentExpiry.getMonth() + sub.months);

                        await db.query('UPDATE admins SET subscription_expiry = ? WHERE id = ?', [currentExpiry, sub.admin_id]);
                    }
                    console.log(`[WEBHOOK] Subscription Renewal Successful: ${reference}`);
                    req.io.emit('data_update', { type: 'subscription' });
                }
            } else if (status === 'failed') {
                await db.query('UPDATE admin_subscriptions SET status = "failed" WHERE reference = ?', [reference]);
                console.log(`[WEBHOOK] Subscription Renewal Failed: ${reference}`);
            }
            return res.status(200).send('OK');
        } catch (err) {
            console.error('[WEBHOOK] Subscription Webhook Error:', err);
            return res.status(500).send('Server Error');
        }
    }

    // --- HANDLE STANDARD TRANSACTIONS ---
    if (status === 'success' || status === 'successful') {
        try {
            // Check if already handled
            const [txs] = await db.query('SELECT * FROM transactions WHERE transaction_ref = ?', [reference]);
            if (txs.length === 0) return res.status(404).send('Transaction not found');

            const tx = txs[0];
            if (tx.status === 'success') return res.status(200).send('Already processed');

            // Extract operator / gateway reference (Airtel / MTN Financial Txn ID)
            const gatewayRef = data.provider_reference || data.financial_transaction_id || data.financial_ref || data.operator_id || data.tx_ref || data.external_reference || null;

            // Fetch Admin Billing Type to calculate Fee
            // Assign Voucher Logic
            const [packages] = await db.query('SELECT * FROM packages WHERE id = ?', [tx.package_id]);
            if (packages.length > 0) {
                const pkg = packages[0];
                const SMS_COST = 35;

                // Calculate Fee using tenant's exact commission_rate
                let feeMs = 0;
                const [admins] = await db.query('SELECT billing_type, commission_rate FROM admins WHERE id = ?', [pkg.admin_id]);
                if (admins.length > 0) {
                    const bType = admins[0].billing_type || 'commission';
                    if (bType === 'commission') {
                        const rawRate = admins[0].commission_rate;
                        const rate = (rawRate !== null && rawRate !== undefined) ? parseFloat(rawRate) : 5.00;
                        feeMs = (tx.amount * rate) / 100;
                    }
                }
                const webhookStr = JSON.stringify(data);
                await db.query('UPDATE transactions SET status = "success", fee = ?, gateway_ref = COALESCE(?, gateway_ref), webhook_data = ? WHERE transaction_ref = ?', [feeMs, gatewayRef, webhookStr, reference]);

                // Notify Payments Update
                req.io.emit('data_update', { type: 'payments' });

                // Pick Next Available Pre-Generated Voucher from Admin Inventory
                let assignedVoucherCode = tx.voucher_code;
                if (!assignedVoucherCode) {
                    const [availableVouchers] = await db.query(
                        'SELECT * FROM vouchers WHERE package_id = ? AND admin_id = ? AND is_used = FALSE AND (status IS NULL OR status != "expired") ORDER BY id ASC LIMIT 1',
                        [tx.package_id, pkg.admin_id]
                    );

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];
                        assignedVoucherCode = voucher.code;
                        await db.query('UPDATE vouchers SET is_used = TRUE, status = "active" WHERE id = ?', [voucher.id]);
                        await db.query('UPDATE transactions SET voucher_code = ? WHERE transaction_ref = ?', [assignedVoucherCode, reference]);
                    } else {
                        console.error(`[VOUCHER EXHAUSTED] Admin ${pkg.admin_id} has 0 unused vouchers remaining for package ${tx.package_id}!`);
                    }
                }

                // Sync voucher to RADIUS (AWAITED to prevent race conditions)
                try {
                    await syncVoucherToRadius(assignedVoucherCode, tx.package_id);
                } catch (radErr) {
                    console.error(`[RADIUS WEBHOOK] Failed to sync voucher ${assignedVoucherCode}:`, radErr);
                }

                // Trigger Server-Side RouterOS API Auto-Login if MAC/IP is known
                const targetRouterId = tx.router_id || pkg.router_id;
                if (targetRouterId && (tx.mac_address || tx.ip_address)) {
                    try {
                        const [routers] = await db.query('SELECT * FROM routers WHERE id = ?', [targetRouterId]);
                        if (routers.length > 0) {
                            const r = routers[0];
                            loginHotspotUserOnRouter({
                                host: r.ip_address,
                                port: r.api_port || 8728,
                                user: r.api_user || 'admin',
                                password: r.api_password || ''
                            }, assignedVoucherCode, assignedVoucherCode, tx.mac_address, tx.ip_address).catch(() => {});
                        }
                    } catch (apiAutoErr) {
                        console.warn('[Auto-Login Webhook Warning]:', apiAutoErr.message);
                    }
                }

                // Check SMS Balance for optional SMS delivery
                const [balRows] = await db.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [pkg.admin_id]);
                const balance = Number(balRows[0].balance || 0);

                if (balance >= SMS_COST) {
                    await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                        [pkg.admin_id, -SMS_COST, `Voucher Sale: ${assignedVoucherCode}`]);

                    const msg = `Payment Received! Your voucher code: ${assignedVoucherCode}. Valid for ${pkg.validity_hours} hrs.`;
                    const smsSuccess = await sendSMS(tx.phone_number, msg, pkg.admin_id);
                    if (!smsSuccess) {
                        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "refund", ?, "success")',
                            [pkg.admin_id, SMS_COST, `Refund: SMS Failed (Ref: ${reference})`]);
                    }
                } else {
                    console.log(`[WEBHOOK] Low SMS Balance (${balance}) for Admin ${pkg.admin_id}. Skipping optional SMS delivery.`);
                }

                req.io.emit('data_update', { type: 'vouchers' });
                req.io.emit('data_update', { type: 'payments' });
                req.io.emit('data_update', { type: 'sms' });

                // Emit real-time payment completion event to user's device
                req.io.emit(`payment_completed_${reference}`, {
                    status: 'SUCCESS',
                    voucher_code: assignedVoucherCode
                });

                // Email Notification
                try {
                    const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [pkg.admin_id]);
                    if (adminRows.length > 0) {
                        sendPaymentNotification(adminRows[0].email, tx.amount, tx.phone_number, reference, assignedVoucherCode, null, adminRows[0].username, pkg.name);
                    }
                } catch (emailErr) { console.error('Email Notification Error:', emailErr); }
            }
            res.status(200).send('OK');
        } catch (err) {
            console.error('[WEBHOOK] Error:', err);
            res.status(500).send('Server Error');
        }
    } else if (status === 'failed') {
        const payloadJson = JSON.stringify(data);
        await db.query('UPDATE transactions SET status = "failed", webhook_data = ? WHERE transaction_ref = ?', [payloadJson, reference]);
        console.log(`[WEBHOOK] Transaction failed: ${reference}`);
        
        // Emit real-time failure event to user's device
        req.io.emit(`payment_completed_${reference}`, {
            status: 'FAILED'
        });
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
        let isWithdrawal = transaction_ref.startsWith('W-');
        let tx = null; // Standard transaction
        let sms = null; // SMS transaction
        let withdrawal = null; // Withdrawal transaction

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
        } else if (isWithdrawal) {
            console.log('[POLL] Lookup in withdrawals...');
            const [rows] = await db.query('SELECT * FROM withdrawals WHERE reference = ?', [transaction_ref]);
            if (rows.length === 0) {
                console.log('[POLL] Not found in withdrawals');
                return res.status(404).json({ error: 'Withdrawal not found' });
            }
            withdrawal = rows[0];
            if (withdrawal.status === 'success') return res.json({ status: 'SUCCESS' });
            if (withdrawal.status === 'failed') return res.json({ status: 'FAILED' });
        } else {
            console.log('[POLL] Lookup in transactions...');
            const [rows] = await db.query('SELECT * FROM transactions WHERE transaction_ref = ?', [transaction_ref]);
            if (rows.length === 0) {
                console.log('[POLL] Not found in transactions');
                return res.status(404).json({ error: 'Transaction not found' });
            }
            tx = rows[0];
            if (tx.status === 'success') {
                if (tx.voucher_code && tx.package_id) {
                    await syncVoucherToRadius(tx.voucher_code, tx.package_id).catch(err => console.error('[RADIUS POLL SYNC ERROR]:', err));
                }
                return res.json({ status: 'SUCCESS', voucher_code: tx.voucher_code });
            }
            if (tx.status === 'failed') return res.json({ status: 'FAILED' });
            if (tx.status === 'failed_low_sms') return res.json({ status: 'FAILED_LOW_SMS' });
        }

        // 2. Gateway Check - Throttle outbound checks to max once per 10 seconds per ref to prevent Relworx rate limits
        const lastCheckTime = relworxPollCache.get(transaction_ref) || 0;
        const now = Date.now();
        if (now - lastCheckTime < 10000) {
            return res.json({ status: 'PENDING' });
        }
        relworxPollCache.set(transaction_ref, now);
        if (relworxPollCache.size > 500) {
            for (const [k, v] of relworxPollCache.entries()) {
                if (now - v > 300000) relworxPollCache.delete(k);
            }
        }

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

            } else if (isWithdrawal) {
                // --- WITHDRAWAL SUCCESS LOGIC ---
                console.log('[POLL] Withdrawal Success. Updating DB...');
                await db.query('UPDATE withdrawals SET status = "success" WHERE reference = ?', [transaction_ref]);
                req.io.emit('data_update', { type: 'withdrawals' });

                try {
                    const balance = await getAdminBalance(withdrawal.admin_id);
                    const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [withdrawal.admin_id]);
                    if (adminRows.length > 0 && adminRows[0].email) {
                        sendWithdrawalNotification(
                            adminRows[0].email,
                            withdrawal.amount,
                            withdrawal.phone_number,
                            transaction_ref,
                            withdrawal.description || 'Admin Withdrawal',
                            balance,
                            adminRows[0].username
                        );
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
                // Calculate Fee
                let feeMs = 0;
                const [admins] = await db.query('SELECT billing_type FROM admins WHERE id = ?', [pkg.admin_id]);
                if (admins.length > 0 && admins[0].billing_type === 'commission') {
                    feeMs = tx.amount * 0.05;
                }

                await db.query('UPDATE transactions SET status = "success", fee = ? WHERE transaction_ref = ?', [feeMs, transaction_ref]);

                // Pick Next Available Pre-Generated Voucher from Admin Inventory
                let assignedVoucherCode = tx.voucher_code;
                if (!assignedVoucherCode) {
                    const [availableVouchers] = await db.query(
                        'SELECT * FROM vouchers WHERE package_id = ? AND admin_id = ? AND is_used = FALSE AND (status IS NULL OR status != "expired") ORDER BY id ASC LIMIT 1',
                        [tx.package_id, pkg.admin_id]
                    );

                    if (availableVouchers.length > 0) {
                        const voucher = availableVouchers[0];
                        assignedVoucherCode = voucher.code;
                        await db.query('UPDATE vouchers SET is_used = TRUE, status = "active" WHERE id = ?', [voucher.id]);
                        await db.query('UPDATE transactions SET voucher_code = ? WHERE transaction_ref = ?', [assignedVoucherCode, transaction_ref]);
                    } else {
                        console.error(`[VOUCHER EXHAUSTED] Admin ${pkg.admin_id} has 0 unused vouchers remaining for package ${tx.package_id}!`);
                    }
                }

                // AWAIT RADIUS SYNC so radcheck table in MySQL is 100% written BEFORE returning response to client
                try {
                    await syncVoucherToRadius(assignedVoucherCode, tx.package_id);
                } catch (radErr) {
                    console.error(`[RADIUS POLL] Failed to sync voucher ${assignedVoucherCode}:`, radErr);
                }

                // Trigger Server-Side RouterOS API Auto-Login if MAC/IP is known
                const targetRouterId = tx.router_id || pkg.router_id;
                if (targetRouterId && (tx.mac_address || tx.ip_address)) {
                    try {
                        const [routers] = await db.query('SELECT * FROM routers WHERE id = ?', [targetRouterId]);
                        if (routers.length > 0) {
                            const r = routers[0];
                            loginHotspotUserOnRouter({
                                host: r.ip_address,
                                port: r.api_port || 8728,
                                user: r.api_user || 'admin',
                                password: r.api_password || ''
                            }, assignedVoucherCode, assignedVoucherCode, tx.mac_address, tx.ip_address).catch(() => {});
                        }
                    } catch (apiAutoErr) {
                        console.warn('[Auto-Login Poll Warning]:', apiAutoErr.message);
                    }
                }

                // Check SMS Balance for optional SMS delivery
                const [balRows] = await db.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ? AND (status="success" OR status IS NULL)', [pkg.admin_id]);
                const balance = Number(balRows[0].balance || 0);

                if (balance >= SMS_COST) {
                    await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "usage", ?, "success")',
                        [pkg.admin_id, -SMS_COST, `Voucher Sale: ${assignedVoucherCode}`]);

                    const msg = `Payment Received! Your voucher code: ${assignedVoucherCode}. Valid for ${pkg.validity_hours} hrs.`;
                    const smsSuccess = await sendSMS(tx.phone_number, msg, pkg.admin_id);
                    if (!smsSuccess) {
                        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status) VALUES (?, ?, "refund", ?, "success")',
                            [pkg.admin_id, SMS_COST, `Refund: SMS Failed (Ref: ${transaction_ref})`]);
                    }
                } else {
                    console.log(`[POLL] Low SMS Balance (${balance}) for Admin ${pkg.admin_id}. Skipping optional SMS delivery.`);
                }

                req.io.emit('data_update', { type: 'vouchers' });
                req.io.emit('data_update', { type: 'payments' });
                req.io.emit('data_update', { type: 'sms' });

                return res.json({ status: 'SUCCESS', voucher_code: assignedVoucherCode });
            }
        }

        if (isFailed) {
            console.log('[POLL] Gateway says FAILED');
            if (isSMS) await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [transaction_ref]);
            else if (isWithdrawal) {
                await db.query('UPDATE withdrawals SET status = "failed" WHERE reference = ?', [transaction_ref]);
                req.io.emit('data_update', { type: 'withdrawals' });
            }
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

    const cleanMsisdn = formatUgandaMSISDN(phone_number);
    if (!cleanMsisdn) {
        return res.status(400).json({ error: 'Invalid phone number format. Please enter a valid 10-digit Ugandan phone number (e.g. 0772000000).' });
    }

    try {
        // Check Admin Subscription Status
        const [subRows] = await db.query('SELECT billing_type, subscription_expiry FROM admins WHERE id = ?', [req.user.id]);
        if (subRows.length > 0) {
            const { billing_type, subscription_expiry } = subRows[0];
            if (billing_type === 'subscription' && subscription_expiry && new Date(subscription_expiry) < new Date()) {
                return res.status(403).json({
                    error: 'Account Expired: Please renew your subscription to perform withdrawals.',
                    code: 'SUBSCRIPTION_EXPIRED'
                });
            }
        }

        // 1. Check Balance
        const currentBalance = await getAdminBalance(req.user.id);

        if (Number(amount) > currentBalance) {
            return res.status(400).json({ error: 'Insufficient funds', message: `Balance: ${currentBalance}` });
        }

        // 2. Check if an active OTP already exists (Rate limit resend for 5 minutes)
        const [existingOtpRows] = await db.query(
            'SELECT withdrawal_otp, withdrawal_otp_expiry FROM admins WHERE id = ? AND withdrawal_otp IS NOT NULL AND withdrawal_otp_expiry > NOW()', 
            [req.user.id]
        );

        if (existingOtpRows.length > 0 && existingOtpRows[0].withdrawal_otp) {
            const expiryTime = new Date(existingOtpRows[0].withdrawal_otp_expiry).getTime();
            const remainingSec = Math.max(0, Math.ceil((expiryTime - Date.now()) / 1000));
            return res.json({ 
                message: 'An active OTP has already been sent to your email.', 
                step: 'otp',
                cooldown: remainingSec || 300
            });
        }

        // Generate New OTP (5 minutes validity)
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await db.query('UPDATE admins SET withdrawal_otp = ?, withdrawal_otp_expiry = ? WHERE id = ?', [otp, expiry, req.user.id]);

        // 3. Send Email
        const [adminRows] = await db.query('SELECT email, username FROM admins WHERE id = ?', [req.user.id]);
        if (adminRows.length > 0 && adminRows[0].email) {
            sendWithdrawalOTP(adminRows[0].email, otp, adminRows[0].username);
        }

        res.json({ message: 'OTP sent to email', step: 'otp', cooldown: 300 });

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
        const formattedPhone = formatUgandaMSISDN(phone_number);
        if (!formattedPhone) {
            return res.status(400).json({ error: 'Invalid phone number format. Please enter a valid 10-digit Ugandan phone number (e.g. 0772000000).' });
        }

        // Balance Check
        const currentBalance = await getAdminBalance(req.user.id);

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

        if (response.ok && (result.success === true || result.status === 'success' || result.status === 'pending')) {
            // 6. In Progress / Pending: Keep as pending until Webhook arrives
            await db.query('UPDATE withdrawals SET status = "pending" WHERE reference = ?', [reference]);
            req.io.emit('data_update', { type: 'withdrawals' });
            res.json({ success: true, reference: reference, message: result.message || 'Send payment in progress.', data: result });
        } else {
            // 7. Failure: Update Status & Reason
            console.warn('[Withdraw] Failed:', result);
            const failReason = result.message || result.error || 'Provider rejected request';
            await db.query('UPDATE withdrawals SET status = "failed", description = CONCAT(COALESCE(description, "Withdrawal"), " - Reason: ", ?) WHERE reference = ?', [failReason, reference]);
            req.io.emit('data_update', { type: 'withdrawals' });
            res.status(400).json({ success: false, error: failReason, details: result });
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

// Withdrawals history list with automatic Relworx gateway status sync
router.get('/admin/withdrawals', authenticateToken, async (req, res) => {
    try {
        // Fix legacy stuck record W-1786183046705-1805 if needed
        await db.query(`UPDATE withdrawals SET status = "failed", description = "Payout Failed by Provider (Airtel Uganda)" WHERE reference = 'W-1786183046705-1805' AND status = 'success'`).catch(() => {});

        const query = 'SELECT * FROM withdrawals WHERE admin_id = ? ORDER BY created_at DESC';
        const [rows] = await db.query(query, [req.user.id]);

        // Auto-check any PENDING withdrawals against Relworx gateway status
        const pendingItems = rows.filter(w => w.status === 'pending');
        if (pendingItems.length > 0) {
            for (const item of pendingItems) {
                try {
                    const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${item.reference}&internal_reference=${item.reference}`;
                    const gwRes = await fetch(checkUrl, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/vnd.relworx.v2',
                            'Authorization': `Bearer ${RELWORX_API_KEY}`
                        }
                    });

                    if (gwRes.ok) {
                        const gwData = await gwRes.json();
                        const gwStatus = (gwData.status || gwData.item_status || '').toUpperCase();
                        if (gwStatus === 'SUCCESS') {
                            await db.query('UPDATE withdrawals SET status = "success" WHERE id = ?', [item.id]);
                            item.status = 'success';
                        } else if (gwStatus === 'FAILED') {
                            const failMsg = gwData.message ? ` (Reason: ${gwData.message})` : ' (Reason: Provider Failed)';
                            await db.query('UPDATE withdrawals SET status = "failed", description = CONCAT(COALESCE(description, "Withdrawal"), ?) WHERE id = ?', [failMsg, item.id]);
                            item.status = 'failed';
                            item.description = (item.description || 'Withdrawal') + failMsg;
                        }
                    }
                } catch (chkErr) {
                    console.error(`[WITHDRAW-CHECK] Status check error for ${item.reference}:`, chkErr.message);
                }
            }
        }

        res.json(rows);
    } catch (err) {
        console.error('Withdrawals History Error:', err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Admin SMS Balance


module.exports = router;
