const SibApiV3Sdk = require('sib-api-v3-sdk');

// Initialize Brevo
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
const campaignApiInstance = new SibApiV3Sdk.EmailCampaignsApi();

/**
 * Generic Email Sender
 * Sends emails using Brevo (sib-api-v3-sdk)
 */
const sendWithBrevo = async (to, subject, html, text = '') => {
    try {
        if (!process.env.BREVO_API_KEY) {
            console.error('[Email] Brevo API Key is missing. Email aborted.');
            return false;
        }

        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = html;
        if (text) sendSmtpEmail.textContent = text;
        
        sendSmtpEmail.sender = { 
            name: "UGPAY Notifications", 
            email: process.env.EMAIL_FROM || process.env.EMAIL_USER || "payments@ugpay.tech" 
        };
        sendSmtpEmail.to = [{ email: to }];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[Email] Brevo Sent successfully:`, data.messageId);
        return true;
    } catch (error) {
        console.error(`[Email] Brevo Failed:`, error.message || error);
        return false;
    }
};

/**
 * Create Email Campaign
 */
const createEmailCampaign = async (name, subject, htmlContent, listIds, scheduledAt = null) => {
    try {
        const emailCampaigns = new SibApiV3Sdk.CreateEmailCampaign();
        emailCampaigns.name = name;
        emailCampaigns.subject = subject;
        emailCampaigns.sender = { 
            name: "UGPAY Notifications", 
            email: process.env.EMAIL_FROM || process.env.EMAIL_USER || "payments@ugpay.tech" 
        };
        emailCampaigns.type = "classic";
        emailCampaigns.htmlContent = htmlContent;
        emailCampaigns.recipients = { listIds: listIds };
        
        if (scheduledAt) {
            emailCampaigns.scheduledAt = scheduledAt;
        }

        const data = await campaignApiInstance.createEmailCampaign(emailCampaigns);
        console.log('[Email] Campaign created successfully:', data);
        return data;
    } catch (error) {
        console.error('[Email] Campaign creation failed:', error.message || error);
        throw error;
    }
};

// Legacy support (all email calls map to Brevo directly now)
const sendWithFallback = sendWithBrevo;

/**
 * Send OTP Email
 * @param {string} to - Recipient email
 * @param {string} code - The OTP code
 */
const sendOTP = async (to, code) => {
    const subject = 'Your UGPAY Verification Code';
    const text = `Your verification code is: ${code}. It expires in 10 minutes.`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #10b981;">Complete Your Registration</h2>
            <p>Use the code below to verify your email address:</p>
            <div style="background: #f4f4f5; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 5px; text-align: center; border-radius: 8px; margin: 20px 0;">
                ${code}
            </div>
            <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
        </div>
    `;
    return await sendWithFallback(to, subject, html, text);
};

/**
 * Send Approval Email
 * @param {string} to - Recipient email
 */
const sendApprovalEmail = async (to) => {
    const subject = 'Account Approved - Welcome to UGPAY';
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #10b981;">Welcome Aboard!</h2>
            <p>Your account has been approved by the admin. You can now login to your dashboard.</p>
            <p><a href="https://ugpay.tech/login_dashboard.html" style="background: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login Dashboard</a></p>
        </div>
    `;
    return await sendWithFallback(to, subject, html);
};

/**
 * Send Payment Notification (Voucher Sale)
 */
const sendPaymentNotification = async (email, amount, phone, ref, code, balance, username) => {
    const subject = `Sale Notification: UGX ${amount}`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #10b981;">New Voucher Sale!</h2>
            <p>Hello <b>${username}</b>, you have a new successful transaction.</p>
            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><b>Amount:</b> UGX ${amount}</p>
                <p><b>Customer:</b> ${phone}</p>
                <p><b>Voucher Code:</b> ${code}</p>
                <p><b>Reference:</b> ${ref}</p>
                <p><b>Wallet Balance:</b> UGX ${balance}</p>
            </div>
            <p style="font-size: 14px; color: #666;">View details in your <a href="https://ugpay.tech/dashboard.html">Dashboard</a>.</p>
        </div>
    `;
    return await sendWithFallback(email, subject, html);
};

/**
 * Send SMS Purchase Notification
 */
const sendSMSPurchaseNotification = async (email, amount, credits, reference, balance, username) => {
    const subject = 'SMS Top-up Successful';
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #10b981;">SMS Credits Added</h2>
            <p>Hello <b>${username}</b>, your SMS wallet has been topped up.</p>
            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><b>Amount Paid:</b> UGX ${amount}</p>
                <p><b>Reference:</b> ${reference}</p>
                <p><b>Current Balance:</b> UGX ${balance}</p>
            </div>
        </div>
    `;
    return await sendWithFallback(email, subject, html);
};

/**
 * Send Withdrawal OTP
 */
const sendWithdrawalOTP = async (email, otp, username) => {
    const subject = 'Withdrawal Authorization Code';
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #ef4444;">Authorize Withdrawal</h2>
            <p>Hello <b>${username}</b>, use the code below to authorize your withdrawal request:</p>
            <div style="background: #fee2e2; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 5px; text-align: center; border-radius: 8px; margin: 20px 0; color: #b91c1c;">
                ${otp}
            </div>
            <p style="font-size: 14px; color: #666;">If you did not initiate this, please secure your account immediately.</p>
        </div>
    `;
    return await sendWithFallback(email, subject, html);
};

/**
 * Send Withdrawal Notification
 */
const sendWithdrawalNotification = async (email, amount, phone, reference, description, balance, username) => {
    const subject = 'Withdrawal Successful';
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #10b981;">Funds Withdrawn</h2>
            <p>Hello <b>${username}</b>, your withdrawal request has been processed successfully.</p>
            <div style="background: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><b>Amount:</b> UGX ${amount}</p>
                <p><b>To Phone:</b> ${phone}</p>
                <p><b>Reference:</b> ${reference}</p>
                <p><b>Description:</b> ${description}</p>
                <p><b>Remaining Balance:</b> UGX ${balance}</p>
            </div>
        </div>
    `;
    return await sendWithFallback(email, subject, html);
};

/**
 * Send Low SMS Balance Warning
 */
const sendLowSMSBalanceWarning = async (email, balance, username) => {
    const subject = 'CRITICAL: Low SMS Balance';
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #f59e0b;">Low SMS Balance Alert</h2>
            <p>Hello <b>${username}</b>, your SMS balance is very low.</p>
            <div style="background: #fffbeb; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p><b>Current Balance:</b> UGX ${balance}</p>
                <p>Your customers may not receive their voucher codes via SMS if the balance runs out.</p>
            </div>
            <p><a href="https://ugpay.tech/dashboard.html" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Top up Now</a></p>
        </div>
    `;
    return await sendWithFallback(email, subject, html);
};

/**
 * Send Agent Sale Notification
 */
const sendAgentSaleNotification = async (adminEmail, agentName, amount, packageName, code, reference) => {
    const subject = `Agent Sale: ${agentName} - UGX ${amount}`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 10px;">
            <h2 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">Agent Sale Recorded</h2>
            <p>Field Agent <b>${agentName}</b> has record a new physical sale.</p>
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <p style="margin: 5px 0;"><b>Package:</b> ${packageName}</p>
                <p style="margin: 5px 0;"><b>Amount:</b> UGX ${amount.toLocaleString()}</p>
                <p style="margin: 5px 0;"><b>Voucher Code:</b> <span style="font-family: monospace; background: #eee; padding: 2px 5px; border-radius: 3px;">${code}</span></p>
                <p style="margin: 5px 0;"><b>Reference:</b> ${reference}</p>
            </div>
            <p style="font-size: 14px; color: #666;">This sale is marked as <b>unsettled</b> in your dashboard until you collect the cash.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="https://ugpay.tech/dashboard.html" style="background: #6366f1; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review in Dashboard</a>
            </p>
        </div>
    `;
    return await sendWithFallback(adminEmail, subject, html);
};

/**
 * Send Registration Notification to Admin
 */
const sendRegistrationNotification = async (adminEmail, registrationData) => {
    const subject = `New Registration Request: ${registrationData.first_name} ${registrationData.last_name}`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; background-color: #f9f9f9; border-radius: 10px;">
            <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">New Registration Request</h2>
            <p>A new client has submitted a registration request and verified their email.</p>
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <h3 style="margin-top: 0; color: #10b981;">Contact Information</h3>
                <p style="margin: 5px 0;"><b>Name:</b> ${registrationData.first_name} ${registrationData.last_name}</p>
                <p style="margin: 5px 0;"><b>Email:</b> ${registrationData.email}</p>
                <p style="margin: 5px 0;"><b>Phone:</b> ${registrationData.phone_number}</p>
                <p style="margin: 5px 0;"><b>WhatsApp:</b> ${registrationData.whatsapp_number || 'N/A'}</p>
                
                <h3 style="margin-top: 20px; color: #10b981;">Business Details</h3>
                <p style="margin: 5px 0;"><b>Hotspot Name:</b> ${registrationData.hotspot_name}</p>
                <p style="margin: 5px 0;"><b>Customer Care:</b> ${registrationData.customer_care_contacts || 'N/A'}</p>
                <p style="margin: 5px 0;"><b>Address:</b> ${registrationData.address || 'N/A'}</p>
                
                <h3 style="margin-top: 20px; color: #10b981;">Technical Information</h3>
                <p style="margin: 5px 0;"><b>Device Type:</b> ${registrationData.device_type || 'N/A'}</p>
                <p style="margin: 5px 0;"><b>Login Method:</b> ${registrationData.login_method || 'N/A'}</p>
                <p style="margin: 5px 0;"><b>System Usage:</b> ${registrationData.system_usage || 'N/A'}</p>
            </div>
            <p style="font-size: 14px; color: #666;">This request is <b>pending approval</b>. Please review and approve/reject in the dashboard.</p>
            <p style="text-align: center; margin-top: 30px;">
                <a href="https://ugpay.tech/dashboard.html" style="background: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review in Dashboard</a>
            </p>
        </div>
    `;
    return await sendWithFallback(adminEmail, subject, html);
};

module.exports = { 
    sendOTP, 
    sendApprovalEmail, 
    sendPaymentNotification, 
    sendSMSPurchaseNotification, 
    sendWithdrawalOTP, 
    sendWithdrawalNotification, 
    sendLowSMSBalanceWarning,
    sendAgentSaleNotification,
    sendRegistrationNotification,
    createEmailCampaign
};
