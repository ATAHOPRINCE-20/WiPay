
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay_db'
};

async function fixSub() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        console.log('Connected to DB.');

        // Update testadmin expiry to 2030
        const [res] = await conn.query(`
            UPDATE admins 
            SET subscription_expiry = '2030-01-01 00:00:00' 
            WHERE username = 'testadmin'
        `);

        console.log('Updated Subscription Expiry:', res.info);
        await conn.end();
    } catch (e) {
        console.error('Error:', e);
    }
}

fixSub();
