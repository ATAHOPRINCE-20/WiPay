const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function migrate() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to DB...');

        const [columns] = await connection.query("SHOW COLUMNS FROM admins LIKE 'withdrawal_otp'");

        if (columns.length === 0) {
            console.log('Adding withdrawal_otp columns...');
            await connection.query(`
                ALTER TABLE admins 
                ADD COLUMN withdrawal_otp VARCHAR(6) NULL,
                ADD COLUMN withdrawal_otp_expiry DATETIME NULL
            `);
            console.log('Migration Successful: Columns added.');
        } else {
            console.log('Migration Skipped: Columns already exist.');
        }

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
