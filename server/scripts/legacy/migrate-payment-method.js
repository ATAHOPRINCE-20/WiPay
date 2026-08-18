const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Adding payment_method to transactions...');
        await db.query(`
            ALTER TABLE transactions 
            ADD COLUMN payment_method VARCHAR(20) DEFAULT 'mobile_money'
        `);
        console.log('Migration successful.');
        process.exit();
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column payment_method already exists.');
        } else {
            console.error('Migration failed:', err);
        }
        process.exit(0);
    }
}

migrate();
