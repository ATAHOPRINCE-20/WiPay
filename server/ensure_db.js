const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function createDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: 'root',
        password: '',
        ssl: { rejectUnauthorized: false }
    });

    console.log('Connected to MySQL as root.');
    await connection.query('CREATE DATABASE IF NOT EXISTS wipay;');
    console.log('Database "wipay" checked/created.');
    await connection.end();
}

createDatabase().catch(err => {
    console.error('Error creating database:', err);
    process.exit(1);
});
