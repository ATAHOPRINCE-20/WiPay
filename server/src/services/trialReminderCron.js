const db = require('../config/db');
const { sendTrialReminderEmail } = require('../utils/email');

async function processTrialReminders() {
    console.log('[TRIAL-REMINDER] Running automatic trial expiration reminder check...');
    try {
        // Query active admins with subscription_expiry set
        const [admins] = await db.query(`
            SELECT id, username, email, business_name, subscription_expiry,
                   trial_reminder_5d_sent_at, trial_reminder_1d_sent_at, trial_reminder_0d_sent_at
            FROM admins
            WHERE role = 'admin'
              AND subscription_expiry IS NOT NULL
              AND email IS NOT NULL
              AND email != ''
        `);

        const now = new Date();

        for (const admin of admins) {
            const expiry = new Date(admin.subscription_expiry);
            const timeDiff = expiry.getTime() - now.getTime();
            const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

            // Check 5 Days Reminder (between 4 and 5 days remaining)
            if (daysLeft === 5 && !admin.trial_reminder_5d_sent_at) {
                console.log(`[TRIAL-REMINDER] Sending 5-day reminder to admin #${admin.id} (${admin.email})`);
                const sent = await sendTrialReminderEmail(admin.email, admin.username, admin.business_name, 5);
                if (sent) {
                    await db.query('UPDATE admins SET trial_reminder_5d_sent_at = NOW() WHERE id = ?', [admin.id]);
                }
            }

            // Check 1 Day Reminder (between 0 and 1 day remaining)
            if (daysLeft === 1 && !admin.trial_reminder_1d_sent_at) {
                console.log(`[TRIAL-REMINDER] Sending 1-day reminder to admin #${admin.id} (${admin.email})`);
                const sent = await sendTrialReminderEmail(admin.email, admin.username, admin.business_name, 1);
                if (sent) {
                    await db.query('UPDATE admins SET trial_reminder_1d_sent_at = NOW() WHERE id = ?', [admin.id]);
                }
            }

            // Check 0 Days / Expired Today Reminder
            if (daysLeft <= 0 && !admin.trial_reminder_0d_sent_at) {
                console.log(`[TRIAL-REMINDER] Sending 0-day expiry notice to admin #${admin.id} (${admin.email})`);
                const sent = await sendTrialReminderEmail(admin.email, admin.username, admin.business_name, 0);
                if (sent) {
                    await db.query('UPDATE admins SET trial_reminder_0d_sent_at = NOW() WHERE id = ?', [admin.id]);
                }
            }
        }
    } catch (err) {
        console.error('[TRIAL-REMINDER ERROR]:', err);
    }
}

function startTrialReminderScheduler() {
    // Run initial check 30 seconds after server startup
    setTimeout(() => {
        processTrialReminders().catch(err => console.error('[TRIAL-REMINDER STARTUP ERROR]:', err));
    }, 30 * 1000);

    // Run periodic check every 2 hours
    setInterval(() => {
        processTrialReminders().catch(err => console.error('[TRIAL-REMINDER PERIODIC ERROR]:', err));
    }, 2 * 60 * 60 * 1000);

    console.log('[TRIAL-REMINDER] Scheduler initialized (Checking every 2 hours).');
}

module.exports = {
    processTrialReminders,
    startTrialReminderScheduler
};
