require('dotenv').config();
const { sendMail } = require('./src/utils/email');

async function runTest() {
    const recipient = process.argv[2] || 'pavinahumuza@gmail.com';
    console.log(`[TEST EMAIL] Testing email dispatch to: ${recipient}`);
    
    const result = await sendMail({
        to: recipient,
        subject: '[TEST] UGPAY Email Delivery Verification',
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #0284c7; margin-top: 0;">UGPAY Email Verification</h2>
                <p>Hello,</p>
                <p>This is a test message to confirm that your UGPAY email delivery setup is working properly.</p>
                <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                <div style="margin-top: 20px; padding: 10px; background-color: #f0f9ff; border-radius: 5px; color: #0369a1; font-size: 13px;">
                    ✅ If you received this email, your email configuration is active and working.
                </div>
            </div>
        `,
        text: 'UGPAY Email Test: Your email delivery setup is active and working.'
    });

    if (result) {
        console.log(`\n✅ Email dispatch to ${recipient} SUCCESSFUL!`);
    } else {
        console.log(`\n❌ Email dispatch to ${recipient} FAILED. Review diagnostic details above.`);
    }
}

runTest();
