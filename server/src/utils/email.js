require('dotenv').config();
const nodemailer = require('nodemailer');

function getTransporter() {
    const port = parseInt(process.env.EMAIL_PORT || '587', 10);
    const isSecure = process.env.EMAIL_SECURE !== undefined
        ? process.env.EMAIL_SECURE === 'true'
        : port === 465;

    if (process.env.EMAIL_HOST) {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: port,
            secure: isSecure,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    return nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS || process.env.BREVO_API_KEY
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

/**
 * Universal Send Email function using Brevo REST API with automatic Nodemailer fallback
 */
async function sendMail({ to, subject, html, text, from, fromName }) {
    if (!to) {
        console.warn('[EMAIL] Recipient email is missing. Skipping.');
        return false;
    }

    const brevoApiKey = process.env.BREVO_API_KEY || (process.env.EMAIL_PASS?.startsWith('xkeysib-') || process.env.EMAIL_PASS?.startsWith('xsmtpsib-') ? process.env.EMAIL_PASS : null);
    const senderEmail = from || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'support@ugpay.tech';
    const senderName = fromName || process.env.EMAIL_FROM_NAME || 'UGPAY Support';

    // Parse array of recipients if comma-separated
    const recipientList = Array.isArray(to) 
        ? to.map(e => ({ email: typeof e === 'string' ? e.trim() : e.email }))
        : String(to).split(',').map(e => ({ email: e.trim() }));

    const errors = [];

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
                const warnMsg = `[RESEND API] HTTP ${response.status}: ${JSON.stringify(resData)}`;
                console.warn(`${warnMsg}. Trying Brevo...`);
                errors.push(warnMsg);
            }
        } catch (resendErr) {
            const errMsg = `[RESEND API Error]: ${resendErr.message}`;
            console.warn(errMsg);
            errors.push(errMsg);
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
                const warnMsg = `[BREVO API] HTTP ${response.status}: ${errText}`;
                console.warn(`${warnMsg}. Trying Brevo SMTP Relay...`);
                errors.push(warnMsg);
            }
        } catch (apiErr) {
            const errMsg = `[BREVO API Error]: ${apiErr.message}`;
            console.warn(`${errMsg}. Trying Brevo SMTP Relay...`);
            errors.push(errMsg);
        }

        // Strategy A2: Brevo SMTP Relay Fallback (Supports both xsmtpsib- and xkeysib- keys)
        try {
            const brevoUser = process.env.BREVO_USER || process.env.EMAIL_USER || senderEmail;
            const brevoSmtpTransporter = nodemailer.createTransport({
                host: 'smtp-relay.brevo.com',
                port: 587,
                secure: false,
                auth: {
                    user: brevoUser,
                    pass: brevoApiKey
                },
                tls: {
                    rejectUnauthorized: false
                }
            });

            await brevoSmtpTransporter.sendMail({
                from: `"${senderName}" <${senderEmail}>`,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject: subject,
                html: html,
                text: text || subject
            });
            console.log(`[BREVO SMTP] Email sent via Brevo SMTP Relay to ${String(to)}`);
            return true;
        } catch (brevoSmtpErr) {
            const errMsg = `[BREVO SMTP Error]: ${brevoSmtpErr.message}`;
            console.warn(`${errMsg}. Falling back to default SMTP...`);
            errors.push(errMsg);
        }
    }

    // Strategy B: Fallback to Nodemailer Transporter
    try {
        const activeTransporter = getTransporter();
        const mailOptions = {
            from: `"${senderName}" <${senderEmail}>`,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject,
            html: html,
            text: text || subject
        };
        await activeTransporter.sendMail(mailOptions);
        console.log(`[EMAIL SMTP] Sent successfully to ${String(to)}`);
        return true;
    } catch (smtpErr) {
        const errMsg = `[EMAIL SMTP Error]: ${smtpErr.message}`;
        console.error(`[EMAIL Error] Failed to send email to ${String(to)}:`, smtpErr.message);
        errors.push(errMsg);
        console.error(`[EMAIL Diagnostic] All email providers failed for recipient ${String(to)}. Summary of failures:\n  - ` + errors.join('\n  - '));
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
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
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
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
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
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
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
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
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

async function sendWelcomeEmail(toEmail, username, businessName) {
    if (!toEmail) return;

    const displayName = businessName || username || 'Partner';
    const adminPhone = '+256757136062';
    const adminLocalPhone = '0757136062';
    const whatsappLink = 'https://wa.me/256757136062?text=Hello%20UGPAY%20Admin,%20I%20need%20help%20with%20my%20MikroTik%20configuration';

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 35px 25px; text-align: center;">
                <h1 style="color: #38bdf8; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">UGPAY Hotspot</h1>
                <p style="color: #94a3b8; font-size: 15px; margin-top: 8px; margin-bottom: 0;">Welcome to Next-Gen Wi-Fi Management</p>
            </div>

            <!-- Body Content -->
            <div style="padding: 30px 25px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Welcome, ${displayName}! 🎉</h2>
                
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Thank you for creating an account with <strong>UGPAY Hotspot Manager</strong>. Your account has been registered successfully.
                </p>

                <!-- 30 Days Trial Reminder Banner -->
                <div style="margin: 25px 0; padding: 20px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px;">
                    <h3 style="color: #1e40af; margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">⏱️ 30 Days Account Access Included</h3>
                    <p style="color: #1e3a8a; margin: 0; font-size: 14px; line-height: 1.5;">
                        Please note that you have <strong>30 days</strong> of account access to set up your hotspot, test voucher sales, and configure your network.
                    </p>
                </div>

                <!-- MikroTik Configuration Support Box -->
                <div style="margin: 25px 0; padding: 22px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
                    <h3 style="color: #166534; margin: 0 0 10px 0; font-size: 16px; font-weight: 700;">📡 Need MikroTik Router Configuration?</h3>
                    <p style="color: #15803d; margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
                        We provide complete setup and configuration for your MikroTik router (Hotspot setup, RADIUS configuration, & Walled Garden scripts).
                    </p>
                    <p style="color: #0f172a; margin: 0 0 15px 0; font-size: 15px; font-weight: 600;">
                        Contact Admin for MikroTik Configurations:
                    </p>
                    <div style="text-align: center; margin-top: 15px;">
                        <a href="${whatsappLink}" target="_blank" style="display: inline-block; background-color: #25d366; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-right: 8px; margin-bottom: 8px;">
                            💬 WhatsApp Admin (${adminLocalPhone})
                        </a>
                        <a href="tel:${adminPhone}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-bottom: 8px;">
                            📞 Call Admin (${adminPhone})
                        </a>
                    </div>
                </div>

                <!-- Next steps -->
                <div style="margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    <h4 style="color: #0f172a; margin: 0 0 10px 0; font-size: 15px;">Getting Started Steps:</h4>
                    <ol style="color: #475569; font-size: 14px; line-height: 1.7; padding-left: 20px; margin: 0;">
                        <li>Log in to your <strong>UGPAY Admin Dashboard</strong>.</li>
                        <li>Add your Wi-Fi router / NAS device details under Routers.</li>
                        <li>Create bandwidth packages & pricing plans.</li>
                        <li>Contact <strong>${adminPhone}</strong> (${adminLocalPhone}) on WhatsApp to get your MikroTik router configuration script.</li>
                    </ol>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">UGPAY Hotspot Management System</p>
                <p style="margin: 0;">Need help? Contact Admin on WhatsApp: <a href="${whatsappLink}" target="_blank" style="color: #0284c7; text-decoration: underline;">${adminLocalPhone} (${adminPhone})</a></p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: `Welcome to UGPAY Hotspot! (30-Day Access & MikroTik Setup Info)`,
        html: html
    });
}

async function sendTrialReminderEmail(toEmail, username, businessName, daysLeft) {
    if (!toEmail) return;

    const displayName = businessName || username || 'Partner';
    const adminPhone = '+256757136062';
    const adminLocalPhone = '0757136062';
    const whatsappLink = 'https://wa.me/256757136062?text=Hello%20UGPAY%20Admin,%20I%20need%20help%20renewing%20my%20subscription%20or%20configuring%20my%20MikroTik';

    let subject = '';
    let titleHeader = '';
    let badgeText = '';
    let badgeBg = '';
    let badgeBorder = '';
    let badgeTextColor = '';
    let mainMessage = '';

    if (daysLeft === 5) {
        subject = `[Reminder] Your UGPAY Account Trial Ends in 5 Days`;
        titleHeader = `5 Days Left on Your Free Trial ⏳`;
        badgeText = `⏱️ 5 Days Remaining`;
        badgeBg = `#eff6ff`;
        badgeBorder = `#3b82f6`;
        badgeTextColor = `#1e40af`;
        mainMessage = `Your initial 30-day account access will expire in <strong>5 days</strong>. To maintain uninterrupted hotspot access and voucher sales, please renew your monthly subscription for <strong>UGX 25,000 / month</strong>.`;
    } else if (daysLeft === 1) {
        subject = `[Urgent] Your UGPAY Account Trial Ends Tomorrow!`;
        titleHeader = `Your Trial Expires Tomorrow ⚠️`;
        badgeText = `🚨 1 Day Remaining`;
        badgeBg = `#fffbeb`;
        badgeBorder = `#f59e0b`;
        badgeTextColor = `#b45309`;
        mainMessage = `Your 30-day trial ends <strong>tomorrow</strong>! Please renew your monthly subscription for <strong>UGX 25,000 / month</strong> today to keep your Wi-Fi hotspot active and prevent service interruption.`;
    } else {
        subject = `[Notice] Your UGPAY Account Access Expired Today`;
        titleHeader = `Your Free Trial Has Expired Today 🔴`;
        badgeText = `❌ Expired Today`;
        badgeBg = `#fef2f2`;
        badgeBorder = `#ef4444`;
        badgeTextColor = `#991b1b`;
        mainMessage = `Your 30-day account access has <strong>expired today</strong>. To reactivate your account and continue managing your hotspot and voucher sales, please renew your monthly subscription for <strong>UGX 25,000 / month</strong>.`;
    }

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 35px 25px; text-align: center;">
                <h1 style="color: #38bdf8; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">UGPAY Hotspot</h1>
                <p style="color: #94a3b8; font-size: 15px; margin-top: 8px; margin-bottom: 0;">Wi-Fi Subscription Renewal Reminder</p>
            </div>

            <!-- Body Content -->
            <div style="padding: 30px 25px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Hello ${displayName},</h2>
                <h3 style="color: #334155; font-size: 17px; margin-top: 5px; font-weight: 600;">${titleHeader}</h3>
                
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    ${mainMessage}
                </p>

                <!-- Status Banner -->
                <div style="margin: 25px 0; padding: 18px; background-color: ${badgeBg}; border-left: 4px solid ${badgeBorder}; border-radius: 8px;">
                    <h4 style="color: ${badgeTextColor}; margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">${badgeText}</h4>
                    <p style="color: #334155; margin: 0; font-size: 14px;">
                        Monthly Subscription Rate: <strong>UGX 25,000 / Month</strong>
                    </p>
                </div>

                <!-- MikroTik & Renewal Contact Support Box -->
                <div style="margin: 25px 0; padding: 22px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
                    <h4 style="color: #166534; margin: 0 0 10px 0; font-size: 16px; font-weight: 700;">💳 Renew Subscription & MikroTik Config Support</h4>
                    <p style="color: #15803d; margin: 0 0 16px 0; font-size: 14px; line-height: 1.5;">
                        You can renew directly via Mobile Money inside your UGPAY Dashboard or contact our Admin directly for subscription renewal or MikroTik router configurations.
                    </p>
                    <p style="color: #0f172a; margin: 0 0 15px 0; font-size: 15px; font-weight: 600;">
                        Admin Support Contact:
                    </p>
                    <div style="text-align: center; margin-top: 15px;">
                        <a href="${whatsappLink}" target="_blank" style="display: inline-block; background-color: #25d366; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-right: 8px; margin-bottom: 8px;">
                            💬 WhatsApp Admin (${adminLocalPhone})
                        </a>
                        <a href="tel:${adminPhone}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 700; font-size: 14px; margin-bottom: 8px;">
                            📞 Call Admin (${adminPhone})
                        </a>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 20px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">UGPAY Hotspot Management System</p>
                <p style="margin: 0;">Need help? WhatsApp Admin: <a href="${whatsappLink}" target="_blank" style="color: #0284c7; text-decoration: underline;">${adminLocalPhone} (${adminPhone})</a></p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        subject: subject,
        html: html
    });
}

async function sendSubscriptionRenewalEmail({ toEmail, username, businessName, amount, months, ref, newExpiry }) {
    if (!toEmail) return false;

    const displayName = businessName || username || 'Partner';
    const formattedExpiry = newExpiry ? new Date(newExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    const durationText = `${months} Month${months > 1 ? 's' : ''}`;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 35px 25px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">🎉 Subscription Renewed!</h1>
                <p style="color: #d1fae5; font-size: 15px; margin-top: 8px; margin-bottom: 0;">UGPAY Hotspot Manager</p>
            </div>

            <!-- Content -->
            <div style="padding: 30px 25px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">Hello ${displayName},</h2>
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Your UGPAY hotspot subscription has been <strong>successfully renewed</strong>! Thank you for staying with us.
                </p>

                <div style="margin: 20px 0; background-color: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; color: #166534; font-size: 14px;"><strong>Renewal Duration:</strong></td>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; font-weight: bold; color: #065f46; font-size: 15px;">${durationText}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; color: #166534; font-size: 14px;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; font-weight: bold; color: #059669; font-size: 15px;">${Number(amount).toLocaleString()} UGX</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; color: #166534; font-size: 14px;"><strong>New Expiration Date:</strong></td>
                            <td style="padding: 12px 16px; border-bottom: 1px solid #dcfce7; font-weight: bold; color: #0f172a; font-size: 15px;">${formattedExpiry}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px 16px; color: #166534; font-size: 14px;"><strong>Payment Reference:</strong></td>
                            <td style="padding: 12px 16px; font-family: monospace; color: #475569; font-size: 13px;">${ref || 'N/A'}</td>
                        </tr>
                    </table>
                </div>

                <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                    All hotspot features including voucher sales, router configurations, and agent portals are active and ready.
                </p>
            </div>

            <!-- Footer -->
            <div style="padding: 20px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-weight: 600;">UGPAY Hotspot Management System • ugpay.tech</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
        subject: `[UGPAY] Subscription Renewed Successfully! (${durationText})`,
        html: html
    });
}

async function sendSuperAdminSubscriptionNotification({ tenantUsername, businessName, amount, months, ref, newExpiry, tenantEmail }) {
    const superAdminEmail = 'ataho955@gmail.com';
    const displayName = businessName || tenantUsername || 'Tenant';
    const formattedExpiry = newExpiry ? new Date(newExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    const durationText = `${months} Month${months > 1 ? 's' : ''}`;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px 25px; text-align: center;">
                <h1 style="color: #38bdf8; margin: 0; font-size: 22px;">💰 Subscription Payment Received</h1>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 6px; margin-bottom: 0;">UGPAY Super Admin Alert</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background-color: #ffffff;">
                <p style="color: #334155; font-size: 15px; margin-top: 0;">
                    Hello Super Admin,
                </p>
                <p style="color: #334155; font-size: 15px;">
                    A tenant has just paid for their monthly subscription:
                </p>

                <div style="margin: 20px 0; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; padding: 15px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>Tenant:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #0f172a; font-size: 15px;">${displayName} (@${tenantUsername})</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>Tenant Email:</strong></td>
                            <td style="padding: 8px 10px; color: #0f172a; font-size: 14px;">${tenantEmail || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #10b981; font-size: 16px;">${Number(amount).toLocaleString()} UGX</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>Duration:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #0369a1; font-size: 14px;">${durationText}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>New Expiration Date:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #0f172a; font-size: 14px;">${formattedExpiry}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #64748b; font-size: 14px;"><strong>Reference:</strong></td>
                            <td style="padding: 8px 10px; font-family: monospace; color: #64748b; font-size: 12px;">${ref || 'N/A'}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 15px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px;">
                <p style="margin: 0;">UGPAY Automated System Alert</p>
            </div>
        </div>
    `;

    return sendMail({
        to: superAdminEmail,
        from: 'payments@ugpay.tech',
        fromName: 'UGPAY Payments',
        subject: `💰 Subscription Paid: ${displayName} (${Number(amount).toLocaleString()} UGX - ${durationText})`,
        html: html
    });
}

async function sendRouterOfflineEmail({ toEmail, username, businessName, routerName, ipAddress, lastSeen }) {
    if (!toEmail) return false;

    const displayName = businessName || username || 'Admin';
    const formattedLastSeen = lastSeen ? new Date(lastSeen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px 25px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">🚨 Router Offline Alert</h1>
                <p style="color: #fecaca; font-size: 14px; margin-top: 6px; margin-bottom: 0;">UGPAY Hotspot System Alert</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 18px; font-weight: 700;">Hello ${displayName},</h2>
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Our automated network monitoring system detected that your MikroTik router <strong>${routerName || 'Router'}</strong> has gone <strong>OFFLINE</strong> and lost VPN connection.
                </p>

                <div style="margin: 20px 0; background-color: #fef2f2; border-radius: 10px; border: 1px solid #fecaca; padding: 16px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 10px; color: #991b1b; font-size: 14px;"><strong>Router Name:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #7f1d1d; font-size: 15px;">${routerName || 'MikroTik Router'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #991b1b; font-size: 14px;"><strong>VPN IP Address:</strong></td>
                            <td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #0f172a; font-size: 14px;">${ipAddress || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #991b1b; font-size: 14px;"><strong>Last Active Handshake:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #7f1d1d; font-size: 14px;">${formattedLastSeen}</td>
                        </tr>
                    </table>
                </div>

                <div style="margin-top: 20px; padding: 16px; background-color: #f8fafc; border-left: 4px solid #ef4444; border-radius: 6px;">
                    <h4 style="color: #0f172a; margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">🛠️ Recommended Troubleshooting Steps:</h4>
                    <ol style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 18px; margin: 0;">
                        <li>Check if the router power supply adapter is plugged in and turned on.</li>
                        <li>Verify your main Internet/WAN cable (Fiber modem, LTE router, or Ethernet) is connected and providing active internet.</li>
                        <li>Reboot your MikroTik router hardware.</li>
                    </ol>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 15px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-weight: 600;">UGPAY Hotspot Management System • ugpay.tech</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        from: 'support@ugpay.tech',
        fromName: 'UGPAY Network Monitor',
        subject: `🚨 [OFFLINE ALERT] Router "${routerName}" is Offline`,
        html: html
    });
}

async function sendRouterOnlineEmail({ toEmail, username, businessName, routerName, ipAddress }) {
    if (!toEmail) return false;

    const displayName = businessName || username || 'Admin';

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px 25px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">🟢 Router Back Online</h1>
                <p style="color: #d1fae5; font-size: 14px; margin-top: 6px; margin-bottom: 0;">UGPAY Hotspot System Alert</p>
            </div>

            <!-- Content -->
            <div style="padding: 25px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; font-size: 18px; font-weight: 700;">Hello ${displayName},</h2>
                <p style="color: #334155; font-size: 15px; line-height: 1.6;">
                    Good news! Your MikroTik router <strong>${routerName || 'Router'}</strong> has successfully re-established its VPN handshake and is back <strong>ONLINE</strong>.
                </p>

                <div style="margin: 20px 0; background-color: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0; padding: 16px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 10px; color: #166534; font-size: 14px;"><strong>Router Name:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #065f46; font-size: 15px;">${routerName || 'MikroTik Router'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #166534; font-size: 14px;"><strong>VPN IP Address:</strong></td>
                            <td style="padding: 8px 10px; font-family: monospace; font-weight: bold; color: #0f172a; font-size: 14px;">${ipAddress || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 10px; color: #166534; font-size: 14px;"><strong>Connection Status:</strong></td>
                            <td style="padding: 8px 10px; font-weight: bold; color: #059669; font-size: 14px;">🟢 Active / Online</td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 15px 25px; background-color: #f1f5f9; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-weight: 600;">UGPAY Hotspot Management System • ugpay.tech</p>
            </div>
        </div>
    `;

    return sendMail({
        to: toEmail,
        from: 'support@ugpay.tech',
        fromName: 'UGPAY Network Monitor',
        subject: `🟢 [RECOVERED] Router "${routerName}" is Back Online`,
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
    sendAgentSaleNotification,
    sendWelcomeEmail,
    sendTrialReminderEmail,
    sendSubscriptionRenewalEmail,
    sendSuperAdminSubscriptionNotification,
    sendRouterOfflineEmail,
    sendRouterOnlineEmail
};


