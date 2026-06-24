const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Migration: Add Email to Admins...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM admins LIKE 'email'");
        if (cols.length === 0) {
            console.log('Adding email column...');
            await conn.query("ALTER TABLE admins ADD COLUMN email VARCHAR(255) UNIQUE DEFAULT NULL");
            console.log('✅ Email column added.');
        } else {
            console.log('ℹ️ Email column already exists.');
        }
    } catch (err) {
        console.error('❌ Migration Failed:', err);
    } finally {
        await conn.end();
    }
}

migrate();
