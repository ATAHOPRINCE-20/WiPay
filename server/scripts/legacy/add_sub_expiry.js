const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Subscription Expiry Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM admins LIKE 'subscription_expiry'");

        if (cols.length === 0) {
            console.log('Adding `subscription_expiry` column to `admins` table...');
            // Default NULL implies infinite or not set.
            await conn.query("ALTER TABLE admins ADD COLUMN subscription_expiry DATETIME DEFAULT NULL AFTER billing_type");
            console.log('Column added successfully.');
        } else {
            console.log('Column `subscription_expiry` already exists.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
        process.exit();
    }
}

migrate();
