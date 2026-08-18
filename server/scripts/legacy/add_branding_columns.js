const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1', // Force IPv4 if undefined
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay'
};

async function migrate() {
    console.log('Starting Branding Migration...');
    const conn = await mysql.createConnection(dbConfig);

    try {
        console.log('Checking admins table...');

        // Check/Add business_name
        const [cols1] = await conn.query("SHOW COLUMNS FROM admins LIKE 'business_name'");
        if (cols1.length === 0) {
            console.log('Adding business_name column...');
            await conn.query("ALTER TABLE admins ADD COLUMN business_name VARCHAR(255) DEFAULT 'UGPAY'");
        } else {
            console.log('business_name already exists.');
        }

        // Check/Add business_phone
        const [cols2] = await conn.query("SHOW COLUMNS FROM admins LIKE 'business_phone'");
        if (cols2.length === 0) {
            console.log('Adding business_phone column...');
            await conn.query("ALTER TABLE admins ADD COLUMN business_phone VARCHAR(50)");
        } else {
            console.log('business_phone already exists.');
        }

        console.log('Migration Complete.');

    } catch (err) {
        console.error('Migration Failed:', err);
    } finally {
        await conn.end();
    }
}

migrate();
