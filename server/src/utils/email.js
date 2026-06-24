const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport(
    process.env.EMAIL_HOST
        ? {
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
        : {
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
);

async function sendPaymentNotification(toEmail, amount, phone, ref, voucherCode, balance, username) {
    if (!toEmail) {
        console.warn('[EMAIL] No admin email provided. Skipping notification.');
        return;
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `Payment Received: ${amount} UGX`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #4caf50;">Payment Successful</h2>
                <p>Hello ${username || 'Admin'},</p>
                <p>A new payment has been confirmed.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${Number(amount).toLocaleString()} UGX</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payer:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${phone}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Reference:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${ref}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Voucher:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #eee;">${voucherCode || 'N/A'}</td>
                    </tr>
                </table>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #4caf50;">
                    <strong>Current Balance:</strong> ${balance ? Number(balance).toLocaleString() : '0'} UGX
                </div>
                <p style="margin-top: 20px; color: #777; font-size: 12px;">UGPAY Notification System</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Sent to ${toEmail} for Ref: ${ref}`);
    } catch (err) {
        console.error('[EMAIL] Failed to send:', err.message);
    }
}

async function sendSMSPurchaseNotification(toEmail, amount, credits, ref, balance, username) {
    if (!toEmail) return;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `SMS Credits Purchased: ${credits} Credits`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #2196f3;">SMS Credits Added</h2>
                <p>Hello ${username || 'Admin'},</p>
                <p>You have successfully purchased SMS credits.</p>
                <p><strong>Amount:</strong> ${Number(amount).toLocaleString()} UGX</p>
                <p><strong>Credits Added:</strong> ${credits}</p>
                <p><strong>Reference:</strong> ${ref}</p>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #2196f3;">
                    <strong>Current Balance:</strong> ${balance ? Number(balance).toLocaleString() : '0'} UGX
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('[EMAIL] Failed to send SMS Notification:', err.message);
    }
}

async function sendWithdrawalNotification(toEmail, amount, phone, ref, description, balance, username) {
    if (!toEmail) return;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `Withdrawal Initiated: ${Number(amount).toLocaleString()} UGX`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #ff9800;">Withdrawal Initiated</h2>
                <p>Hello ${username || 'Admin'},</p>
                <p>A withdrawal request has been processed.</p>
                <p><strong>Amount:</strong> ${Number(amount).toLocaleString()} UGX</p>
                <p><strong>Recipient:</strong> ${phone}</p>
                <p><strong>Reason:</strong> ${description}</p>
                <p><strong>Reference:</strong> ${ref}</p>
                <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #ff9800;">
                    <strong>Current Balance:</strong> ${balance ? Number(balance).toLocaleString() : '0'} UGX
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error('[EMAIL] Failed to send Withdrawal Notification:', err.message);
    }
}

async function sendWithdrawalOTP(toEmail, otp, username) {
    if (!toEmail) return;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `Start Withdrawal: ${otp}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #ff9800;">Withdrawal Verification</h2>
                <p>Hello ${username || 'Admin'},</p>
                <p>Use the One-Time Password (OTP) below to complete your withdrawal request.</p>
                <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; padding: 10px; background: #eee; text-align: center; border-radius: 4px;">
                    ${otp}
                </div>
                <p style="color: #555;">This code expires in 5 minutes.</p>
                <p style="margin-top: 20px; color: #777; font-size: 12px;">If you did not request this, please contact support immediately.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] OTP Sent to ${toEmail}`);
    } catch (err) {
        console.error('[EMAIL] Failed to send OTP:', err.message);
    }
}

async function sendLowSMSBalanceWarning(toEmail, currentBalance, username) {
    if (!toEmail) return;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `ACTION REQUIRED: Low SMS Balance (${currentBalance} Credits)`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #e74c3c;">Low SMS Balance Warning</h2>
                <p>Hello ${username || 'Admin'},</p>
                <p>Your internal SMS balance has dropped to <strong>${Number(currentBalance).toLocaleString()} Credits</strong>.</p>
                <p><strong>Threshold:</strong> 1,000 Credits</p>
                <div style="margin-top: 20px; padding: 15px; background-color: #fdf2f2; border-left: 4px solid #e74c3c; color: #c0392b;">
                    Please top up your SMS credits immediately to ensure uninterrupted service (especially for Auto-Login).
                </div>
                <p style="margin-top: 20px;">Use the Dashboard "Buy SMS" feature to top up instantly.</p>
                <p style="margin-top: 20px; color: #777; font-size: 12px;">UGPAY Notification System</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Low SMS Warning Sent to ${toEmail}`);
    } catch (err) {
        console.error('[EMAIL] Failed to send Low SMS Warning:', err.message);
    }
}

async function sendRegistrationOTP(toEmail, otp) {
    if (!toEmail) return;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: toEmail,
        subject: `Verify Your Email: ${otp}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #16b97a;">Email Verification</h2>
                <p>Hello,</p>
                <p>Thank you for choosing WiPay. Use the One-Time Password (OTP) below to verify your business email address and complete your signup.</p>
                <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; padding: 10px; background: #eee; text-align: center; border-radius: 4px;">
                    ${otp}
                </div>
                <p style="color: #555;">This code expires in 10 minutes.</p>
                <p style="margin-top: 20px; color: #777; font-size: 12px;">If you did not initiate this registration, please ignore this email.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Registration OTP Sent to ${toEmail}`);
    } catch (err) {
        console.error('[EMAIL] Failed to send registration OTP:', err.message);
    }
}

module.exports = {
    sendPaymentNotification,
    sendSMSPurchaseNotification,
    sendWithdrawalNotification,
    sendWithdrawalOTP,
    sendLowSMSBalanceWarning,
    sendRegistrationOTP
};
