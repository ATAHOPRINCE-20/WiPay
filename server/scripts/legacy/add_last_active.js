const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed, but usually scripts run from server root context if called via node

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'wipay'
};

async function migrate() {
    console.log('Adding last_active_at column to admins table...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        const [cols] = await conn.query("SHOW COLUMNS FROM admins LIKE 'last_active_at'");
        if (cols.length === 0) {
            await conn.query("ALTER TABLE admins ADD COLUMN last_active_at DATETIME DEFAULT NULL");
            console.log('Column last_active_at added successfully.');
        } else {
            console.log('Column last_active_at already exists.');
        }
    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
    }
}

migrate();
