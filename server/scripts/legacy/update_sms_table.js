const db = require('../src/config/db');

async function updateSMSTable() {
    try {
        console.log('Updating sms_fees table schema...');

        // Add status and reference columns if they don't exist
        // We use a try-catch block for each column addition to avoid errors if they exist
        try {
            await db.query(`ALTER TABLE sms_fees ADD COLUMN status ENUM('pending', 'success', 'failed') DEFAULT 'success'`);
            console.log('Added status column.');
        } catch (e) {
            console.log('Status column likely exists or error:', e.message);
        }

        try {
            await db.query(`ALTER TABLE sms_fees ADD COLUMN reference VARCHAR(100) UNIQUE`);
            console.log('Added reference column.');
        } catch (e) {
            console.log('Reference column likely exists or error:', e.message);
        }

        console.log('sms_fees table updated successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error updating sms_fees table:', err);
        process.exit(1);
    }
}

updateSMSTable();
