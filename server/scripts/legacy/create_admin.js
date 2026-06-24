const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'wipay'
};

async function createAdmin(username, password, email) {
    const conn = await mysql.createConnection(dbConfig);
    try {
        // Check if exists
        const [rows] = await conn.query('SELECT * FROM admins WHERE username = ? OR email = ?', [username, email]);
        if (rows.length > 0) {
            console.log(`Error: Admin "${username}" or Email "${email}" already exists.`);
            return;
        }

        const hash = await bcrypt.hash(password, 10);
        await conn.query('INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)', [username, hash, email]);
        console.log(`Success: Admin "${username}" created with email ${email}.`);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await conn.end();
    }
}

// Usage: node create_admin.js <username> <password> <email>
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: node create_admin.js <username> <password> <email>');
} else {
    createAdmin(args[0], args[1], args[2]);
}
