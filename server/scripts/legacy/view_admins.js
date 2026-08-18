const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function viewAdmins() {
    const conn = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await conn.query('SELECT id, username, business_name, business_phone FROM admins');
        console.table(rows);
    } catch (err) {
        console.error(err);
    } finally {
        await conn.end();
    }
}

viewAdmins();
