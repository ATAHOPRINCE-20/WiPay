const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Admin Role Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        // Check if role column exists
        const [cols] = await conn.query("SHOW COLUMNS FROM admins LIKE 'role'");

        if (cols.length === 0) {
            console.log('Adding `role` column to `admins` table...');
            await conn.query("ALTER TABLE admins ADD COLUMN role ENUM('admin', 'super_admin') DEFAULT 'admin'");
            console.log('Column added successfully.');
        } else {
            console.log('Column `role` already exists.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
        process.exit();
    }
}

migrate();
