const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'wipay'
};

async function migrate() {
    console.log('Starting Migration: Add Status to Withdrawals...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        // Check if column exists
        const [cols] = await conn.query("SHOW COLUMNS FROM withdrawals LIKE 'status'");

        if (cols.length === 0) {
            console.log('Adding status column...');
            // Default to 'success' for existing records, as they were only inserted on success previously
            await conn.query("ALTER TABLE withdrawals ADD COLUMN status VARCHAR(20) DEFAULT 'success'");
            console.log('Column added successfully.');
        } else {
            console.log('Column status already exists.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
    }
}

migrate();
