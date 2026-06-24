const db = require('./src/config/db');

async function checkActivity() {
    try {
        console.log('--- LAST 10 TRANSACTIONS ---');
        const [transactions] = await db.query('SELECT id, transaction_ref, phone_number, amount, status, created_at FROM transactions ORDER BY created_at DESC LIMIT 10');
        console.table(transactions);

        console.log('\n--- LAST 10 VOUCHER USAGES ---');
        const [vouchers] = await db.query('SELECT id, code, used_by, used_at FROM vouchers WHERE is_used = 1 ORDER BY used_at DESC LIMIT 10');
        console.table(vouchers);

        console.log('\n--- LAST 10 SMS FEES ---');
        const [sms] = await db.query('SELECT id, amount, type, description, status, created_at FROM sms_fees ORDER BY created_at DESC LIMIT 10');
        console.table(sms);

        process.exit(0);
    } catch (err) {
        console.error('Error fetching activity:', err);
        process.exit(1);
    }
}

checkActivity();
