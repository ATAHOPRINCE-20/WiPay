const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

(async () => {
    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log('Connected to DB...');

        const hashedPassword = await bcrypt.hash('password123', 10);

        await conn.query('UPDATE admins SET password = ? WHERE username = ?', [hashedPassword, 'pike']);
        console.log('Password updated for pike to password123');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (conn) await conn.end();
    }
})();
