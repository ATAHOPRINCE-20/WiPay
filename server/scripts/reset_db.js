const db = require('../src/config/db');
require('dotenv').config();

async function resetDatabase() {
    console.log('⚠ WARNING: This will delete all transaction history and reset vouchers.');
    console.log('Starting Database Reset...');

    try {
        const conn = await db.getConnection();

        // Disable Foreign Key Checks to allow truncation
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // 1. Clear Transaction Data
        console.log('Truncating transactions...');
        await conn.query('TRUNCATE TABLE transactions');

        console.log('Truncating withdrawals...');
        await conn.query('TRUNCATE TABLE withdrawals');

        console.log('Truncating sms_fees...');
        await conn.query('TRUNCATE TABLE sms_fees');

        // 2. Clear Subscription History (Optional - keeping Admins active)
        console.log('Truncating admin_subscriptions...');
        await conn.query('TRUNCATE TABLE admin_subscriptions');

        // 3. Reset Vouchers (Make them all available again)
        console.log('Resetting vouchers to unused...');
        await conn.query('UPDATE vouchers SET is_used = 0');

        // Enable Foreign Key Checks
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        conn.release();
        console.log('✅ Database Reset Complete. Ready for Production.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Reset Failed:', err);
        process.exit(1);
    }
}

resetDatabase();
