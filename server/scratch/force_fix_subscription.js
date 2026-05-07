const db = require('../src/config/db');

async function fix() {
    const reference = 'SUB-1778007985169-329';
    console.log(`[FIX] Starting fix for ${reference}...`);

    try {
        const [rows] = await db.query('SELECT * FROM admin_subscriptions WHERE reference = ?', [reference]);
        
        if (rows.length === 0) {
            console.error(`[ERROR] Transaction ${reference} not found in database.`);
            process.exit(1);
        }

        const sub = rows[0];
        if (sub.status === 'success') {
            console.log(`[SKIP] Transaction is already marked as SUCCESS.`);
            process.exit(0);
        }

        // 1. Mark as success
        await db.query('UPDATE admin_subscriptions SET status = "success" WHERE reference = ?', [reference]);
        console.log(`[SUCCESS] Transaction marked as success.`);

        // 2. Update Admin Expiry
        const [adminRows] = await db.query('SELECT subscription_expiry FROM admins WHERE id = ?', [sub.admin_id]);
        if (adminRows.length > 0) {
            let currentExpiry = new Date(adminRows[0].subscription_expiry || Date.now());
            const now = new Date();
            
            // If already expired, start from today. Otherwise, add to existing.
            if (currentExpiry < now) currentExpiry = now;
            
            currentExpiry.setMonth(currentExpiry.getMonth() + sub.months);
            
            await db.query('UPDATE admins SET subscription_expiry = ? WHERE id = ?', [currentExpiry, sub.admin_id]);
            console.log(`[SUCCESS] Admin ${sub.admin_id} subscription extended to ${currentExpiry.toISOString()}`);
        }

        console.log(`[FINISH] Fix completed successfully.`);
        process.exit(0);
    } catch (err) {
        console.error(`[ERROR] Fix failed:`, err);
        process.exit(1);
    }
}

fix();
