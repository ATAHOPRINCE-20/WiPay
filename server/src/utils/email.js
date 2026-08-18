require('dotenv').config();
const nodemailer = require('nodemailer');

// 1. Create default Nodemailer Transporter for Brevo / Custom SMTP
const transporter = nodemailer.createTransport(
    process.env.EMAIL_HOST
        ? {
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '587'),
            secure: process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_PORT === '465',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        }
        : {
            host: 'smtp-relay.brevo.com',
            port: 587,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS || process.env.BREVO_API_KEY
            }
        }
);

/**
 * Universal Send Email function using Brevo REST API with automatic Nodemailer fallback
 */
async function sendMail({ to, subject, html, text }) {
    if (!to) {
        console.warn('[EMAIL] Recipient email is missing. Skipping.');
        return false;
    }

    const brevoApiKey = process.env.BREVO_API_KEY || (process.env.EMAIL_PASS?.startsWith('xkeysib-') || process.env.EMAIL_PASS?.startsWith('xsmtpsib-') ? process.env.EMAIL_PASS : null);
    const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'payments@ugpay.tech';
    const senderName = process.env.EMAIL_FROM_NAME || 'UGPAY Hotspot';

    // Parse array of recipients if comma-separated
    const recipientList = Array.isArray(to) 
        ? to.map(e => ({ email: typeof e === 'string' ? e.trim() : e.email }))
        : String(to).split(',').map(e => ({ email: e.trim() }));

    // Strategy A0: Resend REST API (Direct HTTPS POST)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: `${senderName} <onboarding@resend.dev>`,
                    to: Array.isArray(to) ? to : String(to).split(',').map(e => e.trim()),
                    subject: subject,
                    html: html,
                    text: text || subject
                })
            });

            const resData = await response.json();
            if (response.ok) {
                console.log(`[RESEND API] Email sent to ${String(to)} (Id: ${resData.id})`);
                return true;
            } else {
                console.warn(`[RESEND API Warning] ${response.status}: ${JSON.stringify(resData)}. Trying Brevo...`);
            }
        } catch (resendErr) {
            console.warn(`[RESEND API Error]: ${resendErr.message}`);
        }
    }

    // Strategy A: Brevo REST API (Fastest & direct HTTPS POST)
    if (brevoApiKey) {
        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': brevoApiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: senderName, email: senderEmail },
                    to: recipientList,
                    subject: subject,
                    htmlContent: html,
                    textContent: text || subject
                })
            });

            if (response.ok) {
                const resData = await response.json();
                console.log(`[BREVO API] Email sent to ${String(to)} (MessageId: ${resData.messageId || 'OK'})`);
                return true;
            } else {
                const errText = await response.text();
                console.warn(`[BREVO API Warning] ${response.status}: ${errText}. Falling back to Nodemailer SMTP...`);
            }
        } catch (apiErr) {
            console.warn(`[BREVO API Error]: ${apiErr.message}. Falling back to Nodemailer SMTP...`);
        }
    }

    // Strategy B: Fallback to Nodemailer Transporter
    try {
        const mailOptions = {
            from: `"${senderName}" <${senderEmail}>`,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject,
            html: html,
            text: text || subject
        };
        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SMTP] Sent successfully to ${String(to)}`);
        return true;
    } catch (smtpErr) {
        console.error(`[EMAIL Error] Failed to send email to ${String(to)}:`, smtpErr.message);
        return false;
    }
}

async function sendPaymentNotification(toEmail, amount, phone, ref, voucherCode, balance, username, packageName) {
    const targetEmail = toEmail || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!targetEmail) return;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px; margin: 0 auto; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                <h2 style="color: #10b981; margin: 0; font-size: 22px;">🎉 New Voucher Purchase!</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 5px;">A customer just purchased a Wi-Fi voucher code.</p>
            </div>

            <div style="margin-top: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Voucher Code:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; font-family: monospace; font-size: 18px; color: #0f172a;">${voucherCode || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Amount Paid:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #10b981;">${Number(amount).toLocaleString()} UGX</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Package:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #334155;">${packageName || 'Wi-Fi Package'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Customer Phone:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #334155;">${phone}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Payment Reference:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-family: monospace; color: #64748b; font-size: 12px;">${ref}</td>
                    </tr>
                </table>
            </div>

            <div style="margin-top: 25px; padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                <p style="margin: 0; font-size: 13px; color: #166534;">
                    <strong>Current Balance:</strong> ${balance ? Number(balance).toLocaleString() : 'Active'} UGX
                </p>
            </div>

            <div style="margin-top: 25px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p>UGPAY Central Hotspot System • ugpay.tech</p>
            </div>
        </div>
    `;

    return sendMail({
        to: targetEmail,
        subject: `[UGPAY] Voucher Sold: ${voucherCode} (${Number(amount).toLocaleString()} UGX)`,
        html: html
    });
}

async function sendSMSPurchaseNotification(toEmail, amount, credits, ref, balance, username) {
    if (!toEmail) return;

    const html = `
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
    `;

    return sendMail({
        to: toEmail,
        subject: `[UGPAY] SMS Credits Purchased: ${credits} Credits`,
        html: html
    });
}

async function sendWithdrawalNotification(toEmail, amount, phone, ref, description, balance, username) {
    if (!toEmail) return;

    const html = `
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
    `;

    return sendMail({
        to: toEmail,
        subject: `[UGPAY] Withdrawal Initiated: ${Number(amount).toLocaleString()} UGX`,
        html: html
    });
}

async function sendWithdrawalOTP(toEmail, otp, username) {
    if (!toEmail) return;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;">
                <h2 style="color: #d97706; margin: 0;">Withdrawal Verification Code</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Security Authorization Required</p>
            </div>

            <p style="color: #334155; font-size: 15px; margin-top: 20px;">Hello ${username || 'Admin'},</p>
            <p style="color: #334155; font-size: 14px;">A withdrawal request was initiated from your account. Enter the authorization code below to confirm:</p>

            <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #d97706; margin: 25px 0; padding: 16px; background-color: #fffbeb; text-align: center; border-radius: 8px; border: 1px dashed #d97706;">
                ${otp}
            </div>

            <p style="color: #64748b; font-size: 13px;">This code expires in <strong>5 minutes</strong>. If you did not request a withdrawal, please change your password immediately.</p>
            
            <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p>UGPAY Financial Security System</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: `[SECURITY] ${otp} is your UGPAY withdrawal confirmation code`,
        html: html
    });
}

async function sendLowSMSBalanceWarning(toEmail, currentBalance, username) {
    if (!toEmail) return;

    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #e74c3c;">Low SMS Balance Warning</h2>
            <p>Hello ${username || 'Admin'},</p>
            <p>Your internal SMS balance has dropped to <strong>${Number(currentBalance).toLocaleString()} Credits</strong>.</p>
            <p><strong>Threshold:</strong> 1,000 Credits</p>
            <div style="margin-top: 20px; padding: 15px; background-color: #fdf2f2; border-left: 4px solid #e74c3c; color: #c0392b;">
                Please top up your SMS credits immediately to ensure uninterrupted service.
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: `[ACTION REQUIRED] Low SMS Balance (${currentBalance} Credits)`,
        html: html
    });
}

async function sendRegistrationOTP(toEmail, otp) {
    if (!toEmail) return;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;">
                <h2 style="color: #0f172a; margin: 0;">Verify Your Email</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Welcome to UGPAY Hotspot Manager</p>
            </div>

            <p style="color: #334155; font-size: 15px; margin-top: 20px;">Hello,</p>
            <p style="color: #334155; font-size: 14px;">Thank you for choosing UGPAY. Use the One-Time Password (OTP) below to verify your business email address and complete your signup:</p>

            <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0284c7; margin: 25px 0; padding: 16px; background-color: #f0f9ff; text-align: center; border-radius: 8px; border: 1px dashed #0284c7;">
                ${otp}
            </div>

            <p style="color: #64748b; font-size: 13px;">This OTP expires in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
            
            <div style="margin-top: 30px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p>UGPAY Hotspot Management System</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: `${otp} is your UGPAY verification code`,
        html: html
    });
}

async function sendAgentSaleNotification(toEmail, agentUsername, amount, packageName, voucherCode, ref) {
    if (!toEmail) return;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 550px; margin: 0 auto; background-color: #ffffff;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                <h2 style="color: #10b981; margin: 0; font-size: 22px;">🛍️ Agent Voucher Sale Alert!</h2>
                <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Your reseller agent <strong>${agentUsername}</strong> just made a physical voucher sale.</p>
            </div>

            <div style="margin-top: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Agent Name:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #0f172a;">${agentUsername}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Voucher Code:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; font-family: monospace; font-size: 18px; color: #0f172a;">${voucherCode || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Cash Collected:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #10b981;">${Number(amount).toLocaleString()} UGX</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Package:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-weight: 500; color: #334155;">${packageName || 'Wi-Fi Package'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b;"><strong>Sale Reference:</strong></td>
                        <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; font-family: monospace; color: #64748b; font-size: 12px;">${ref}</td>
                    </tr>
                </table>
            </div>

            <div style="margin-top: 25px; padding: 15px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #10b981;">
                <p style="margin: 0; font-size: 13px; color: #166534;">
                    💡 <strong>Note:</strong> Cash sales collected by agents are tracked under Agent Cash Sales and are separate from your online withdrawable balance.
                </p>
            </div>

            <div style="margin-top: 25px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                <p>UGPAY Agent Management System • ugpay.tech</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: `[UGPAY Agent Sale] ${agentUsername} sold voucher ${voucherCode} (${Number(amount).toLocaleString()} UGX)`,
        html: html
    });
}

module.exports = {
    sendMail,
    sendPaymentNotification,
    sendSMSPurchaseNotification,
    sendWithdrawalNotification,
    sendWithdrawalOTP,
    sendLowSMSBalanceWarning,
    sendRegistrationOTP,
    sendAgentSaleNotification
};
