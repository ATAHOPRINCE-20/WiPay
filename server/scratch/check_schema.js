const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const [vouchers] = await connection.query('DESCRIBE vouchers');
        console.log('--- Vouchers Table ---');
        console.table(vouchers);

        const [packages] = await connection.query('DESCRIBE packages');
        console.log('--- Packages Table ---');
        console.table(packages);

    } catch (e) {
        console.error(e);
    } finally {
        await connection.end();
    }
}

checkSchema();
