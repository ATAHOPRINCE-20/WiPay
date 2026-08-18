
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wipay_db'
};

async function seed() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        console.log('Connected to DB.');

        // 1. Get testadmin ID
        const [users] = await conn.query('SELECT id FROM admins WHERE username = ?', ['testadmin']);
        if (users.length === 0) {
            console.error('testadmin not found!');
            process.exit(1);
        }
        const adminId = users[0].id;
        console.log(`Seeding data for testadmin (ID: ${adminId})...`);

        // 2. Clear existing data for this admin (optional, for safety)
        // await conn.query('DELETE FROM vouchers WHERE admin_id = ?', [adminId]);
        // await conn.query('DELETE FROM packages WHERE admin_id = ?', [adminId]);
        // await conn.query('DELETE FROM categories WHERE admin_id = ?', [adminId]);

        // 3. Create Categories
        const [catRes] = await conn.query('INSERT INTO categories (name, admin_id) VALUES (?, ?)', ['Daily Bundles', adminId]);
        const catId = catRes.insertId;
        console.log(`Created Category: Daily Bundles (ID: ${catId})`);

        // 4. Create Packages
        const [pkgRes] = await conn.query(`
            INSERT INTO packages (category_id, name, price, validity_hours, data_limit_mb, created_at, admin_id)
            VALUES (?, ?, ?, ?, ?, NOW(), ?)
        `, [catId, 'Unlimited 24h', 1000, 24, 0, adminId]);
        const pkgId = pkgRes.insertId;
        console.log(`Created Package: Unlimited 24h (ID: ${pkgId})`);

        // 5. Create Vouchers (Available)
        const codes = ['TEST-1234', 'TEST-5678', 'TEST-9012', 'TEST-3456', 'TEST-7890'];
        for (const code of codes) {
            await conn.query(`
                INSERT IGNORE INTO vouchers (package_id, code, comment, package_ref, admin_id, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `, [pkgId, code, 'Seeded Voucher', 'REF001', adminId]);
        }
        console.log(`Created ${codes.length} Vouchers.`);

        // 6. Create SMS Logs (Mock)
        await conn.query(`
            INSERT INTO sms_logs (phone_number, message, status, admin_id, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, ['+256700000001', 'Welcome to WiPay!', 'sent', adminId]);
        console.log('Created SMS Log.');

        await conn.end();
        console.log('Seeding Complete!');

    } catch (e) {
        console.error('Error:', e);
    }
}

seed();
