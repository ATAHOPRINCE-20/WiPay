const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

const targetUsername = process.argv[2];

if (!targetUsername) {
    console.log('Usage: node scripts/promote_super_admin.js <username>');
    process.exit(1);
}

async function promote() {
    const conn = await mysql.createConnection(dbConfig);
    try {
        const [users] = await conn.query('SELECT * FROM admins WHERE username = ?', [targetUsername]);

        if (users.length === 0) {
            console.error(`User "${targetUsername}" not found.`);
        } else {
            await conn.query('UPDATE admins SET role = "super_admin" WHERE username = ?', [targetUsername]);
            console.log(`User "${targetUsername}" promoted to Super Admin successfully.`);
        }
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await conn.end();
        process.exit();
    }
}

promote();
