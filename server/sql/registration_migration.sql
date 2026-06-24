CREATE TABLE IF NOT EXISTS registration_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    whatsapp_number VARCHAR(20) NOT NULL,
    hotspot_name VARCHAR(255) NOT NULL,
    customer_care_contacts TEXT,
    device_type VARCHAR(50) DEFAULT 'Mikrotik',
    login_method VARCHAR(50) DEFAULT 'Voucher',
    address TEXT,
    system_usage VARCHAR(50) DEFAULT 'Billing System',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
