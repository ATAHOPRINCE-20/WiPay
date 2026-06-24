const db = require('../src/config/db');

async function setupSMSTable() {
    try {
        console.log('Creating sms_fees table...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS sms_fees (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                type ENUM('deposit', 'usage') NOT NULL,
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (admin_id)
            )
        `);

        console.log('sms_fees table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error creating sms_fees table:', err);
        process.exit(1);
    }
}

setupSMSTable();
