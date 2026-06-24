const db = require('../src/config/db');

async function createTable() {
    try {
        console.log('Creating admin_subscriptions table...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS admin_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                months INT NOT NULL,
                phone_number VARCHAR(20),
                status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
                reference VARCHAR(50) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ admin_subscriptions table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to create table:', err);
        process.exit(1);
    }
}

createTable();
