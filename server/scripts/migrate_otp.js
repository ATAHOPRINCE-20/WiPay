const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Starting migration...');
        
        // Check if columns exist (simplified: just try to add them, ignore if exists error or use specific checks)
        // Better: Use specific ALTER statements.
        
        const connection = await db.getConnection();
        
        try {
            // 1. Add OTP Columns if not exist
            // MySQL doesn't have IF NOT EXISTS for columns in ALTER TABLE easily.
            // We'll wrap in try-catch blocks.
            
            try {
                await connection.query("ALTER TABLE registration_requests ADD COLUMN otp_code VARCHAR(10) NULL AFTER email");
                console.log('Added otp_code column.');
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') console.log('otp_code already exists.');
                else console.error('Error adding otp_code:', e.message);
            }

            try {
                await connection.query("ALTER TABLE registration_requests ADD COLUMN otp_expiry TIMESTAMP NULL AFTER otp_code");
                console.log('Added otp_expiry column.');
            } catch (e) {
                if (e.code === 'ER_DUP_FIELDNAME') console.log('otp_expiry already exists.');
                else console.error('Error adding otp_expiry:', e.message);
            }

            // 2. Modify Status Enum
            // ERROR 1265: Data truncated if we change enum and existing data doesn't fit? No, we are adding values.
            try {
                await connection.query("ALTER TABLE registration_requests MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'pending_otp', 'pending_approval') DEFAULT 'pending_otp'");
                console.log('Updated status ENUM.');
            } catch (e) {
                console.error('Error updating status ENUM:', e.message);
            }

        } finally {
            connection.release();
        }

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

migrate();
