const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'wipay'
};

const TABLES_TO_UPDATE = [
    'categories',
    'packages',
    'vouchers',
    'transactions',
    'sms_logs',
    'withdrawals'
];

async function migrate() {
    console.log('Starting Multi-Tenancy Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        // 1. Create Admins Table
        console.log('Creating `admins` table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create Default Admin
        console.log('Checking for default admin...');
        const [admins] = await conn.query('SELECT * FROM admins WHERE username = ?', ['admin']);
        let defaultAdminId;

        if (admins.length === 0) {
            console.log('Creating default admin (admin / password)...');
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('password', salt);
            const [result] = await conn.query('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
            defaultAdminId = result.insertId;
        } else {
            console.log('Default admin exists.');
            defaultAdminId = admins[0].id;
        }

        // 3. Update Existing Tables
        for (const table of TABLES_TO_UPDATE) {
            console.log(`Processing table: ${table}...`);

            // Check if column exists
            const [cols] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE 'admin_id'`);

            if (cols.length === 0) {
                console.log(`  Adding admin_id column to ${table}...`);
                await conn.query(`ALTER TABLE ${table} ADD COLUMN admin_id INT`);

                console.log(`  Assigning existing records to Admin ID ${defaultAdminId}...`);
                await conn.query(`UPDATE ${table} SET admin_id = ? WHERE admin_id IS NULL`, [defaultAdminId]);

                // Optional: Add FK (Skipping for simplicity if tables are MyISAM or strict usage)
                // await conn.query(`ALTER TABLE ${table} ADD FOREIGN KEY (admin_id) REFERENCES admins(id)`); 
            } else {
                console.log(`  Column admin_id already exists in ${table}.`);
            }
        }

        console.log('Migration Complete! Multi-tenancy enabled.');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
    }
}

migrate();
