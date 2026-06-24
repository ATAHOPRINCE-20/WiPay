const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Transaction Fee Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM transactions LIKE 'fee'");

        if (cols.length === 0) {
            console.log('Adding `fee` column to `transactions` table...');
            // Default 0.00 so existing transactions effectively have 0 fee (unless retroactively applied)
            await conn.query("ALTER TABLE transactions ADD COLUMN fee DECIMAL(10,2) DEFAULT 0.00 AFTER amount");
            console.log('Column added successfully.');
        } else {
            console.log('Column `fee` already exists.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
        process.exit();
    }
}

migrate();
