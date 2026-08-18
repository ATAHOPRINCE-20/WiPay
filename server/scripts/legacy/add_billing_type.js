const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Billing Type Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM admins LIKE 'billing_type'");

        if (cols.length === 0) {
            console.log('Adding `billing_type` column to `admins` table...');
            await conn.query("ALTER TABLE admins ADD COLUMN billing_type ENUM('commission', 'subscription') DEFAULT 'commission' AFTER role");
            console.log('Column added successfully.');
        } else {
            console.log('Column `billing_type` already exists.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
        process.exit();
    }
}

migrate();
