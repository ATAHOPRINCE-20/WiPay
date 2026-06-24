const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
};

async function migrate() {
    console.log('Connecting...');
    const conn = await mysql.createConnection(dbConfig);
    try {
        console.log('Adding email column...');
        await conn.query("ALTER TABLE admins ADD COLUMN email VARCHAR(255) UNIQUE DEFAULT NULL");
        console.log('Success: email column added.');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists.');
        } else {
            console.error('Error:', e.message);
        }
    } finally {
        await conn.end();
    }
}

migrate();
