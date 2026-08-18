const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay_db'
};

async function createTestAdmin() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const password = await bcrypt.hash('password123', 10);

        // Insert or Update
        const [rows] = await connection.query('SELECT * FROM admins WHERE username = ?', ['testadmin']);
        if (rows.length > 0) {
            console.log('Updating testadmin password...');
            await connection.query('UPDATE admins SET password_hash = ? WHERE id = ?', [password, rows[0].id]);
        } else {
            console.log('Creating testadmin...');
            await connection.query('INSERT INTO admins (username, password_hash, email, subscription_expiry) VALUES (?, ?, ?, ?)',
                ['testadmin', password, 'test@example.com', '2023-01-01 00:00:00']);
        }
        console.log('✅ Test Admin Ready: testadmin / password123');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

createTestAdmin();
