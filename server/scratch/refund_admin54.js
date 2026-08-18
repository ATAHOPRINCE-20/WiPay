const mysql = require('mysql2/promise');
require('dotenv').config();

async function check() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    const [adminRows] = await db.query('SELECT id, username FROM admins');
    console.log("All Admins:", adminRows);
    
    await db.end();
}

check().catch(console.error);
