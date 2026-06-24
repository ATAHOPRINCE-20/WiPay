const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env' });

async function init() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: 'root',
        password: '',
        database: 'wipay',
        ssl: { rejectUnauthorized: false }
    });

    console.log('Connected to wipay database.');

    // 1. Admins Table
    console.log('Creating admins table...');
    await connection.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('super_admin', 'admin') DEFAULT 'admin',
            billing_type VARCHAR(50) DEFAULT 'commission',
            subscription_expiry DATETIME DEFAULT NULL,
            last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            email VARCHAR(255),
            business_name VARCHAR(255),
            business_phone VARCHAR(20),
            vpn_ip VARCHAR(50),
            vpn_private_key TEXT,
            vpn_public_key TEXT,
            vpn_server_pub TEXT,
            vpn_endpoint TEXT
        );
    `);

    // 2. Registration Requests Table
    console.log('Creating registration_requests table...');
    await connection.query(`
        CREATE TABLE IF NOT EXISTS registration_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone_number VARCHAR(20) NOT NULL,
            whatsapp_number VARCHAR(20),
            hotspot_name VARCHAR(255),
            customer_care_contacts TEXT,
            device_type VARCHAR(50),
            login_method VARCHAR(50),
            address TEXT,
            system_usage VARCHAR(50),
            status ENUM('pending', 'pending_otp', 'pending_approval', 'approved', 'rejected') DEFAULT 'pending',
            otp_code VARCHAR(10),
            otp_expiry DATETIME,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 3. Ensure a Super Admin exists for testing
    const adminUser = 'admin';
    const adminPass = 'password';
    console.log(`Checking for super_admin ${adminUser}...`);
    const [rows] = await connection.query('SELECT * FROM admins WHERE username = ?', [adminUser]);
    if (rows.length === 0) {
        const hash = await bcrypt.hash(adminPass, 10);
        await connection.query(
            "INSERT INTO admins (username, password_hash, role, email) VALUES (?, ?, 'super_admin', 'admin@example.com')",
            [adminUser, hash]
        );
        console.log(`✅ Created super_admin: ${adminUser} / ${adminPass}`);
    } else {
        console.log('✅ Super admin already exists.');
    }

    await connection.end();
    console.log('Initialization complete.');
}

init().catch(err => {
    console.error('Initialization failed:', err);
    process.exit(1);
});
