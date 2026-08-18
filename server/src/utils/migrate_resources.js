const db = require('../config/db');

async function migrateResources() {
    try {
        console.log('--- Migrating Resources Table ---');
        await db.query(`
            CREATE TABLE IF NOT EXISTS resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                file_path VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Resources table created/verified.');
    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        process.exit();
    }
}

migrateResources();
