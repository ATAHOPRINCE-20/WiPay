const mysql = require('mysql2/promise');
require('dotenv').config();

async function restore() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    });

    console.log('Connected to DB. Restoring tables...');

    const queries = [
        `CREATE TABLE IF NOT EXISTS routers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            mikhmon_url VARCHAR(255) NOT NULL,
            admin_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id)
        )`,
        `CREATE TABLE IF NOT EXISTS categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            admin_id INT,
            router_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id)
        )`,
        `CREATE TABLE IF NOT EXISTS packages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category_id INT,
            name VARCHAR(255) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            validity_hours INT DEFAULT 0,
            data_limit_mb INT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE,
            admin_id INT,
            router_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id),
            INDEX(router_id)
        )`,
        `CREATE TABLE IF NOT EXISTS vouchers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            package_id INT,
            code VARCHAR(50) NOT NULL,
            comment TEXT,
            package_ref VARCHAR(100),
            is_used BOOLEAN DEFAULT FALSE,
            used_by VARCHAR(20),
            used_at DATETIME,
            admin_id INT,
            router_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id),
            INDEX(package_id),
            INDEX(code)
        )`,
        `CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            transaction_ref VARCHAR(100) UNIQUE,
            phone_number VARCHAR(20),
            amount DECIMAL(15, 2),
            status VARCHAR(20) DEFAULT 'pending',
            payment_method VARCHAR(20),
            package_id INT,
            router_id INT,
            admin_id INT,
            voucher_code VARCHAR(50),
            fee DECIMAL(10, 2) DEFAULT 0,
            webhook_data JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id),
            INDEX(status)
        )`,
        `CREATE TABLE IF NOT EXISTS sms_fees (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT,
            amount DECIMAL(10, 2),
            type VARCHAR(20),
            description TEXT,
            status VARCHAR(20),
            reference VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id)
        )`,
        `CREATE TABLE IF NOT EXISTS withdrawals (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_id INT,
            amount DECIMAL(15, 2),
            phone_number VARCHAR(20),
            description TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            fee DECIMAL(10, 2) DEFAULT 0,
            otp VARCHAR(10),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(admin_id)
        )`,
         `CREATE TABLE IF NOT EXISTS resources (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255),
            url VARCHAR(255),
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (const q of queries) {
        try {
            await connection.query(q);
            console.log('Executed table creation.');
        } catch (e) {
            console.error('Query Failed:', q.substring(0, 50) + '...', e.message);
        }
    }

    // Insert dummy transaction data for testing if empty
    // await connection.query("INSERT INTO transactions (transaction_ref, amount, status, admin_id) VALUES ('REF001', 50000, 'success', 1)");

    console.log('Restore complete.');
    process.exit();
}

restore();
