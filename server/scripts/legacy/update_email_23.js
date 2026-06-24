const mysql = require('mysql2/promise');
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

        const [rows] = await conn.query('SELECT id, username, email FROM admins WHERE id = 23');
        if (rows.length === 0) {
            console.log('Admin ID 23 not found.');
        } else {
            console.log('Found admin (Before):', rows[0]);
            await conn.query('UPDATE admins SET email = ? WHERE id = 23', ['ataho955@gmail.com']);
            console.log('Updated email for Admin 23 (pike) to ataho955@gmail.com');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (conn) await conn.end();
    }
})();
